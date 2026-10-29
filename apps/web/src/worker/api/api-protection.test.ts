import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { publicationDateAt } from '@somequote/domain';
import { seededRandom } from '@somequote/domain/testing';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { ErrorDto, HistoryDto, PublicationDto } from '../../shared/api-contract';
import { D1QuoteRepository } from '../db/d1-quote-repository';
import { generalQuote, insertQuotes, quotes, resetDatabase } from '../test-support';
import { createApp } from './app';
import { rateLimitClient } from './rate-limit';

let clock: Date;
let cache: Cache;
let app: ReturnType<typeof createApp>;
const repositoryFor = vi.fn((bindings: Env) => new D1QuoteRepository(bindings.DB));
const limit = vi.fn<RateLimit['limit']>();

async function request(path: string, headers?: HeadersInit) {
  const ctx = createExecutionContext();
  const response = await app.request(
    `https://somequote.test${path}`,
    { headers: { 'CF-Connecting-IP': '203.0.113.7', ...headers } },
    { ...env, API_RATE_LIMITER: { limit } },
    ctx,
  );
  const body = (await response.json()) as unknown;
  await waitOnExecutionContext(ctx);
  return { response, body };
}

beforeEach(async () => {
  await resetDatabase();
  await insertQuotes(quotes('general', 10, generalQuote));
  clock = new Date('2026-10-18T16:00:00Z');
  cache = await caches.open(`api-protection-${crypto.randomUUID()}`);
  repositoryFor.mockClear();
  limit.mockReset().mockResolvedValue({ success: true });
  app = createApp({
    repositoryFor,
    now: () => clock,
    random: seededRandom(7),
    cacheFor: () => cache,
  });
});

describe('shared API caching', () => {
  it('serves repeated requests and cache-busting queries without querying D1 again', async () => {
    const first = await request('/api/quote/today');
    const second = await request('/api/quote/today?bust=123&_publication=wrong');

    expect(second.body).toEqual(first.body);
    expect(repositoryFor).toHaveBeenCalledTimes(1);
    expect(second.response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(second.response.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
  });

  it('reduces the browser TTL on a cache hit so it cannot extend the original expiry', async () => {
    await request('/api/quote/today');
    clock = new Date('2026-10-18T16:30:00Z');

    const { response } = await request('/api/quote/today');

    expect(repositoryFor).toHaveBeenCalledTimes(1);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=1800');
    expect(response.headers.get('Date')).toBe(clock.toUTCString());
    expect(response.headers.get('Expires')).toBe(new Date('2026-10-18T17:00:00Z').toUTCString());
  });

  it.each([
    ['/api/quote/today', ['/api/quote/%74oday', '/api/qu%6fte/today', '/api/qu%6Fte/today']],
    [
      '/api/quotes/history',
      ['/api/quotes/%68istory', '/api/qu%6ftes/history', '/api/qu%6Ftes/hist%6Fry'],
    ],
  ])('shares the %s cache entry across encoded route paths', async (path, variants) => {
    const first = await request(path);
    for (const variant of variants) {
      const next = await request(variant);
      expect(next.response.status).toBe(200);
      expect(next.body).toEqual(first.body);
    }
    expect(repositoryFor).toHaveBeenCalledTimes(1);
  });

  it('refills a response after its hour expires', async () => {
    const first = await request('/api/quote/today');
    clock = new Date('2026-10-18T17:00:00Z');

    const second = await request('/api/quote/today');

    expect(second.body).toEqual(first.body);
    expect(repositoryFor).toHaveBeenCalledTimes(2);
    expect(second.response.headers.get('Cache-Control')).toBe('public, max-age=3600');
  });

  it.each([
    '2026-10-19T03:59:59Z',
    '2027-01-16T04:59:59Z',
    '2026-03-09T03:59:59Z',
    '2026-11-02T04:59:59Z',
  ])('expires at Eastern midnight after %s, including DST changes', async (instant) => {
    clock = new Date(instant);
    const first = await request('/api/quote/today');
    const firstHistory = await request('/api/quotes/history');
    expect(first.response.headers.get('Cache-Control')).toBe('public, max-age=1');
    expect(firstHistory.response.headers.get('Cache-Control')).toBe('public, max-age=1');

    clock = new Date(clock.getTime() + 1000);
    const second = await request('/api/quote/today');
    const secondHistory = await request('/api/quotes/history');

    expect(PublicationDto.parse(second.body).date).toBe(publicationDateAt(clock));
    expect(PublicationDto.parse(second.body).date).not.toBe(PublicationDto.parse(first.body).date);
    expect(HistoryDto.parse(secondHistory.body).items[0]?.date).toBe(publicationDateAt(clock));
  });

  it('shares equivalent history queries and keeps different pages separate', async () => {
    const first = await request('/api/quotes/history');
    const second = await request('/api/quotes/history?before=2027-01-01&bust=1&limit=010');
    expect(second.body).toEqual(first.body);
    expect(repositoryFor).toHaveBeenCalledTimes(1);

    await request('/api/quotes/history?limit=5');
    const previous = await request('/api/quotes/history?before=2026-10-18');
    expect(HistoryDto.parse(previous.body).items).toEqual([]);
    expect(repositoryFor).toHaveBeenCalledTimes(3);
  });

  it('validates history parameters even when a successful response is already cached', async () => {
    await request('/api/quotes/history');
    const { response, body } = await request('/api/quotes/history?limit=31');

    expect(response.status).toBe(400);
    expect(ErrorDto.parse(body).error.code).toBe('invalid_request');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(repositoryFor).toHaveBeenCalledTimes(1);
  });

  it('does not cache errors, so the next request can recover immediately', async () => {
    await env.DB.prepare('UPDATE quotes SET enabled = 0').run();
    const failure = await request('/api/quote/today');
    expect(failure.response.status).toBe(503);
    expect(failure.response.headers.get('Cache-Control')).toBe('no-store');

    await env.DB.prepare('UPDATE quotes SET enabled = 1').run();
    const success = await request('/api/quote/today');
    expect(success.response.status).toBe(200);
    expect(repositoryFor).toHaveBeenCalledTimes(2);
  });

  it('answers without waiting for the cache write to finish', async () => {
    let finishWrite = () => {};
    vi.spyOn(cache, 'put').mockReturnValue(
      new Promise<void>((resolve) => {
        finishWrite = resolve;
      }),
    );
    const ctx = createExecutionContext();

    const response = await app.request(
      'https://somequote.test/api/quote/today',
      { headers: { 'CF-Connecting-IP': '203.0.113.7' } },
      { ...env, API_RATE_LIMITER: { limit } },
      ctx,
    );

    expect(response.status).toBe(200);
    finishWrite();
    await waitOnExecutionContext(ctx);
  });

  it('continues serving publications when the cache is unavailable, and warns about it', async () => {
    vi.spyOn(cache, 'match').mockRejectedValue(new Error('cache read unavailable'));
    vi.spyOn(cache, 'put').mockRejectedValue(new Error('cache write unavailable'));
    const logWarning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    onTestFinished(() => logWarning.mockRestore());

    const { response, body } = await request('/api/quote/today');

    expect(response.status).toBe(200);
    expect(PublicationDto.parse(body).date).toBe('2026-10-18');
    expect(logWarning.mock.calls.map(([entry]) => entry.annotations.operation)).toEqual([
      'match',
      'put',
    ]);
  });
});

describe('history query validation', () => {
  it.each([
    'limit=1&limit=30',
    'limit=1&limit=1',
    'limit=1&%6cimit=31',
    'before=2026-10-18&before=2026-10-17',
    'before=2026-10-18&%62efore=invalid',
    'before=2026-10-18%0a',
    'before=2026-10-18%0d',
    'before=2026-10-18%E2%80%A8',
    'before=2026-10-18%E2%80%A9',
    'before=2026-02-30',
    'before=2026-10-18%27%20OR%201=1--',
    'limit=-1',
    'limit=0',
    'limit=31',
    'limit=999',
    'limit=1.5',
    'limit=0x10',
    'limit=1e1',
    'limit=%2010',
    'limit=10%0a',
    'limit=%2b10',
    'limit=',
    `limit=${'0'.repeat(1000)}1`,
  ])('rejects %s before reading the cache or D1', async (query) => {
    const match = vi.spyOn(cache, 'match');
    const { response, body } = await request(`/api/quotes/history?${query}`);

    expect(response.status).toBe(400);
    expect(ErrorDto.parse(body).error.code).toBe('invalid_request');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(match).not.toHaveBeenCalled();
    expect(repositoryFor).not.toHaveBeenCalled();
  });
});

describe('API throttling', () => {
  it('rejects excess requests before touching either cached content or D1', async () => {
    await request('/api/quote/today');
    limit.mockResolvedValue({ success: false });

    const cached = await request('/api/quote/today');
    const uncached = await request('/api/quotes/history');

    for (const { response, body } of [cached, uncached]) {
      expect(response.status).toBe(429);
      expect(ErrorDto.parse(body).error.code).toBe('rate_limited');
      expect(response.headers.get('Retry-After')).toBe('60');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    }
    expect(repositoryFor).toHaveBeenCalledTimes(1);

    limit.mockResolvedValue({ success: true });
    expect((await request('/api/quote/today')).response.status).toBe(200);
    expect(repositoryFor).toHaveBeenCalledTimes(1);
  });

  it('shares a trusted IP bucket across endpoints and ignores spoofed forwarding headers', async () => {
    await request('/api/quote/today', { 'X-Forwarded-For': '1.2.3.4' });
    await request('/api/quotes/history', { 'X-Forwarded-For': '5.6.7.8' });

    expect(limit.mock.calls.map(([options]) => options.key)).toEqual([
      'somequote:api:203.0.113.7',
      'somequote:api:203.0.113.7',
    ]);

    await request('/api/quote/today', { 'CF-Connecting-IP': '203.0.113.8' });
    expect(limit).toHaveBeenLastCalledWith({ key: 'somequote:api:203.0.113.8' });
  });

  it('shares one bucket across an IPv6 /64, so rotating addresses cannot multiply the limit', async () => {
    await request('/api/quote/today', { 'CF-Connecting-IP': '2001:db8:aa:1:1111:2222:3333:4444' });
    await request('/api/quote/today', { 'CF-Connecting-IP': '2001:0DB8:00AA:0001::9' });
    await request('/api/quote/today', { 'CF-Connecting-IP': '2001:db8:aa:2::1' });

    expect(limit.mock.calls.map(([options]) => options.key)).toEqual([
      'somequote:api:2001:db8:aa:1::/64',
      'somequote:api:2001:db8:aa:1::/64',
      'somequote:api:2001:db8:aa:2::/64',
    ]);
  });

  it.each([
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['::1', '0:0:0:0::/64'],
    ['fe80::', 'fe80:0:0:0::/64'],
    ['::ffff:198.51.100.4', '198.51.100.4'],
    ['198.51.100.4', '198.51.100.4'],
  ])('keys %s as %s', (ip, client) => {
    expect(rateLimitClient(ip)).toBe(client);
  });

  it('also throttles unknown paths and requests without an IP header', async () => {
    limit.mockResolvedValue({ success: false });

    const response = await app.request('/api/missing', {}, { ...env, API_RATE_LIMITER: { limit } });

    expect(response.status).toBe(429);
    expect(limit).toHaveBeenCalledWith({ key: 'somequote:api:unknown' });
    expect(repositoryFor).not.toHaveBeenCalled();
  });
});
