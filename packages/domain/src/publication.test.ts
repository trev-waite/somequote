import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  ensurePublication,
  historyCursor,
  NoEligibleQuoteError,
  PublicationContendedError,
  type QuoteRepository,
} from './publication';
import { parsePublicationDate } from './publication-clock';
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
