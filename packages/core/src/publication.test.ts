import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  ensurePublication,
  historyCursor,
  listHistory,
  NoEligibleQuoteError,
  type Publication,
  PublicationContendedError,
  type QuoteRepository,
} from './publication';
import { addDays, parsePublicationDate } from './publication-clock';
import { parseQuoteId } from './quote';
import type { QuoteUsage } from './selection';

const today = parsePublicationDate('2026-10-18');

function emptyDayRepository(candidates: readonly QuoteUsage[]): QuoteRepository {
  return {
    findPublication: () => Effect.succeed(null),
    loadSelectionSnapshot: () =>
      Effect.succeed({ candidates, publishedCount: 0, recentCategories: [] }),
    publishIfAbsent: () => Effect.succeed(null),
    listPublications: () => Effect.succeed([]),
  };
}

describe('ensurePublication', () => {
  it('fails with a typed error when no quote is enabled', async () => {
    const error = await Effect.runPromise(
      Effect.flip(ensurePublication({ repository: emptyDayRepository([]), date: today })),
    );

    expect(error).toBeInstanceOf(NoEligibleQuoteError);
  });

  it('gives up with a typed error when every chosen quote is disabled before it is recorded', async () => {
    const candidate: QuoteUsage = {
      id: parseQuoteId('only'),
      category: 'general',
      timesPublished: 0,
      lastPublishedOn: null,
    };

    const error = await Effect.runPromise(
      Effect.flip(ensurePublication({ repository: emptyDayRepository([candidate]), date: today })),
    );

    expect(error).toBeInstanceOf(PublicationContendedError);
    expect(error).toMatchObject({ date: today, attempts: 3 });
  });
});

describe('listHistory', () => {
  const publishedOn = (date: Publication['date']): Publication => ({
    date,
    quote: {
      category: 'general',
      id: parseQuoteId(`quote-${date}`),
      text: 'Text.',
      author: 'An Author',
      source: 'A Book',
    },
  });

  function recordingRepository(stored: readonly Publication[]) {
    const calls: string[] = [];
    const repository: QuoteRepository = {
      findPublication: (date) => {
        calls.push('findPublication');
        return Effect.succeed(stored.find((publication) => publication.date === date) ?? null);
      },
      loadSelectionSnapshot: () => Effect.die('unreachable'),
      publishIfAbsent: () => Effect.die('unreachable'),
      listPublications: ({ before, limit }) => {
        calls.push('listPublications');
        return Effect.succeed(
          stored
            .filter((publication) => before === null || publication.date < before)
            .slice(0, limit),
        );
      },
    };
    return { repository, calls };
  }

  it('reads a page that already includes today in one query', async () => {
    const { repository, calls } = recordingRepository([
      publishedOn(today),
      publishedOn(addDays(today, -1)),
    ]);

    const page = await Effect.runPromise(listHistory({ repository, today, limit: 10 }));

    expect(page.publications.map((publication) => publication.date)).toEqual([
      today,
      addDays(today, -1),
    ]);
    expect(calls).toEqual(['listPublications']);
  });

  it('reads an older page without checking today', async () => {
    const { repository, calls } = recordingRepository([publishedOn(addDays(today, -2))]);

    await Effect.runPromise(listHistory({ repository, today, before: today, limit: 10 }));

    expect(calls).toEqual(['listPublications']);
  });
});

describe('historyCursor', () => {
  it('starts after today when no cursor is given', () => {
    expect(historyCursor(today, undefined)).toBe('2026-10-19');
  });

  it('keeps a cursor up to tomorrow', () => {
    expect(historyCursor(today, parsePublicationDate('2026-10-01'))).toBe('2026-10-01');
    expect(historyCursor(today, parsePublicationDate('2026-10-19'))).toBe('2026-10-19');
  });

  it('clamps later cursors, so future dates share one page', () => {
    expect(historyCursor(today, parsePublicationDate('2099-01-01'))).toBe('2026-10-19');
  });
});
