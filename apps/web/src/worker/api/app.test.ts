import { env } from 'cloudflare:workers';
import { type QuoteRepository, QuoteStoreError } from '@somequote/domain/publication';
import { seededRandom } from '@somequote/domain/testing';
import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorDto, HistoryDto, PublicationDto } from '../../shared/api-contract';
import { D1QuoteRepository } from '../db/d1-quote-repository';
import {
  bibleVerse,
  generalQuote,
  insertQuotes,
  publicationRows,
  quotes,
  resetDatabase,
} from '../test-support';
import { createApp } from './app';

let clock = new Date('2026-10-18T16:00:00Z');
/** Each request comes from its own address, so these tests never meet the real rate limiter. */
let requestNumber = 0;

function appAt(
  instant: string,
  repositoryFor: (bindings: Env) => QuoteRepository = (bindings) =>
    new D1QuoteRepository(bindings.DB),
) {
  clock = new Date(instant);
  return createApp({ repositoryFor, now: () => clock, random: seededRandom(7) });
}

async function get(app: ReturnType<typeof createApp>, path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  requestNumber++;
  headers.set('CF-Connecting-IP', `10.0.${requestNumber >> 8}.${requestNumber & 255}`);
  const response = await app.request(path, { ...init, headers }, env);
  return { response, body: (await response.json()) as unknown };
}

beforeEach(async () => {
  await resetDatabase();
  await insertQuotes([...quotes('general', 12, generalQuote), ...quotes('verse', 3, bibleVerse)]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/quote/today', () => {
  it('returns the Eastern day’s publication in the documented shape', async () => {
    const { response, body } = await get(appAt('2026-10-18T16:00:00Z'), '/api/quote/today');

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toMatch(/^application\/json/);
    const publication = PublicationDto.parse(body);
    expect(publication.date).toBe('2026-10-18');
  });

  it('shows every visitor the same quote, including simultaneous first visitors', async () => {
    const app = appAt('2026-10-18T16:00:00Z');

    const responses = await Promise.all(
      Array.from({ length: 12 }, () => get(app, '/api/quote/today')),
    );

    const ids = new Set(responses.map(({ body }) => PublicationDto.parse(body).quote.id));
    expect(ids.size).toBe(1);
    expect(await publicationRows()).toHaveLength(1);
  });

  it('rolls over at midnight in New York, not UTC', async () => {
    const lateEvening = await get(appAt('2026-10-19T03:59:59Z'), '/api/quote/today');
    const midnight = await get(appAt('2026-10-19T04:00:00Z'), '/api/quote/today');

    expect(PublicationDto.parse(lateEvening.body).date).toBe('2026-10-18');
    expect(PublicationDto.parse(midnight.body).date).toBe('2026-10-19');
  });

  it('lets clients cache only until the next publication', async () => {
    const halfHourBefore = await get(appAt('2026-10-19T03:30:00Z'), '/api/quote/today');
    const midday = await get(appAt('2026-10-18T16:00:00Z'), '/api/quote/today');

    expect(halfHourBefore.response.headers.get('Cache-Control')).toBe('public, max-age=1800');
    expect(midday.response.headers.get('Cache-Control')).toBe('public, max-age=3600');
  });

  it('sends security headers and no CORS grant', async () => {
    const { response } = await get(appAt('2026-10-18T16:00:00Z'), '/api/quote/today', {
      headers: { Origin: 'https://elsewhere.example' },
    });

    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('answers 503 with a typed error when nothing can be published, and logs the outage', async () => {
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await env.DB.prepare('UPDATE quotes SET enabled = 0').run();

    const { response, body } = await get(appAt('2026-10-18T16:00:00Z'), '/api/quote/today');

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(ErrorDto.parse(body).error.code).toBe('no_quote_available');
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'ERROR',
        message: 'Request failed',
        cause: expect.stringContaining('NoEligibleQuoteError'),
      }),
    );
  });

  it.each([
    [
      'a storage failure',
      Effect.fail(
        new QuoteStoreError({
          operation: 'findPublication',
          cause: new Error('D1_ERROR: secret table detail'),
        }),
      ),
    ],
    ['an unexpected defect', Effect.die(new Error('D1_ERROR: secret table detail'))],
  ])('hides %s behind a generic error and logs its cause', async (_, failure) => {
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing: QuoteRepository = {
      findPublication: () => failure,
      loadSelectionSnapshot: () => Effect.die('unreachable'),
      publishIfAbsent: () => Effect.die('unreachable'),
      listPublications: () => Effect.die('unreachable'),
    };

    const { response, body } = await get(
      appAt('2026-10-18T16:00:00Z', () => failing),
      '/api/quote/today',
    );

    expect(response.status).toBe(500);
    expect(ErrorDto.parse(body).error.code).toBe('internal_error');
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'ERROR',
        message: 'Request failed',
        cause: expect.stringContaining('secret table detail'),
        annotations: { route: '/api/quote/today' },
      }),
    );
  });
});

describe('GET /api/quotes/history', () => {
  async function publishThrough(days: number) {
    for (let day = 0; day < days; day++) {
      const instant = new Date(Date.UTC(2026, 9, 1 + day, 16));
      await get(appAt(instant.toISOString()), '/api/quote/today');
    }
  }

  it('lists publications newest first and pages with nextBefore', async () => {
    await publishThrough(12);
    const app = appAt('2026-10-12T16:00:00Z');

    const first = HistoryDto.parse((await get(app, '/api/quotes/history?limit=5')).body);
    const second = HistoryDto.parse(
      (await get(app, `/api/quotes/history?limit=5&before=${first.nextBefore}`)).body,
    );
    const last = HistoryDto.parse(
      (await get(app, `/api/quotes/history?limit=5&before=${second.nextBefore}`)).body,
    );

    const dates = [...first.items, ...second.items, ...last.items].map((item) => item.date);
    expect(dates).toEqual(
      Array.from({ length: 12 }, (_, index) => `2026-10-${String(12 - index).padStart(2, '0')}`),
    );
    expect(last.nextBefore).toBeNull();
  });

  it('matches what /api/quote/today served on each day', async () => {
    const served = [];
    for (const instant of [
      '2026-10-01T16:00:00Z',
      '2026-10-02T16:00:00Z',
      '2026-10-03T16:00:00Z',
    ]) {
      served.unshift(PublicationDto.parse((await get(appAt(instant), '/api/quote/today')).body));
    }

    const history = HistoryDto.parse(
      (await get(appAt('2026-10-03T18:00:00Z'), '/api/quotes/history')).body,
    );

    expect(history.items).toEqual(served);
  });

  it('never lists days after today', async () => {
    await env.DB.prepare(
      "INSERT INTO publications (publish_date, quote_id) VALUES ('2026-12-25', 'general-1')",
    ).run();

    const history = HistoryDto.parse(
      (await get(appAt('2026-10-18T16:00:00Z'), '/api/quotes/history?before=2027-01-01')).body,
    );

    expect(history.items.map((item) => item.date)).toEqual(['2026-10-18']);
  });

  it('includes today even before anyone has asked for today’s quote', async () => {
    const history = HistoryDto.parse(
      (await get(appAt('2026-10-18T16:00:00Z'), '/api/quotes/history')).body,
    );

    expect(history.items.map((item) => item.date)).toEqual(['2026-10-18']);
  });

  it.each([['limit=0'], ['limit=31'], ['limit=ten'], ['before=2026-02-30'], ['before=yesterday']])(
    'rejects %s with a typed 400',
    async (query) => {
      const { response, body } = await get(
        appAt('2026-10-18T16:00:00Z'),
        `/api/quotes/history?${query}`,
      );

      expect(response.status).toBe(400);
      expect(ErrorDto.parse(body).error.code).toBe('invalid_request');
    },
  );
});

describe('other requests', () => {
  it.each([
    ['an unknown path', '/api/quotes/random', 'GET'],
    ['a write to a read-only endpoint', '/api/quote/today', 'POST'],
  ])('answers %s with a typed 404', async (_, path, method) => {
    const { response, body } = await get(appAt('2026-10-18T16:00:00Z'), path, { method });

    expect(response.status).toBe(404);
    expect(ErrorDto.parse(body).error.code).toBe('not_found');
  });
});
