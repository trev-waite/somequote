import { Data, Effect } from 'effect';
import { addDays, type PublicationDate } from './publication-clock';
import type { Quote, QuoteId } from './quote';
import { type Random, ROTATION_LENGTH, type SelectionSnapshot, selectQuote } from './selection';

export interface Publication {
  readonly date: PublicationDate;
  readonly quote: Quote;
}

export interface PublishOutcome {
  readonly publication: Publication;
  readonly recorded: boolean;
}

/** Storage could not be reached, or returned data it should never hold. */
export class QuoteStoreError extends Data.TaggedError('QuoteStoreError')<{
  readonly operation: string;
  readonly cause: unknown;
}> {
  override readonly message = `Quote storage failed in ${this.operation}.`;
}

/**
 * Storage for quotes and their permanent publication history. Implementations must enforce at most
 * one publication per date in storage itself; `ensurePublication` relies on that, not on locks.
 */
export interface QuoteRepository {
  findPublication(date: PublicationDate): Effect.Effect<Publication | null, QuoteStoreError>;

  /** Reads every selection input from one consistent view of the data. */
  loadSelectionSnapshot(options: {
    readonly recentLimit: number;
  }): Effect.Effect<SelectionSnapshot, QuoteStoreError>;

  /**
   * Atomically records `quoteId` for `date` unless the date already has a publication or the quote
   * is no longer enabled. Succeeds with whichever publication holds the date afterwards, possibly a
   * concurrent writer's, and whether this call recorded it, or `null` if the date is still empty.
   */
  publishIfAbsent(input: {
    readonly date: PublicationDate;
    readonly quoteId: QuoteId;
  }): Effect.Effect<PublishOutcome | null, QuoteStoreError>;

  /** Newest first, strictly before `before` when it is set. */
  listPublications(query: {
    readonly before: PublicationDate | null;
    readonly limit: number;
  }): Effect.Effect<Publication[], QuoteStoreError>;
}

export class NoEligibleQuoteError extends Data.TaggedError('NoEligibleQuoteError') {
  override readonly message = 'No enabled quote is available to publish.';
}

/** Every chosen quote was disabled before it could be recorded. */
export class PublicationContendedError extends Data.TaggedError('PublicationContendedError')<{
  readonly date: PublicationDate;
  readonly attempts: number;
}> {
  override readonly message =
    `Could not publish a quote for ${this.date} in ${this.attempts} attempts.`;
}

export type PublicationError = QuoteStoreError | NoEligibleQuoteError | PublicationContendedError;

const MAX_PUBLISH_ATTEMPTS = 3;

/**
 * Returns the publication for `date`, selecting and recording one first if none exists. Safe to
 * repeat and to run concurrently: every caller converges on the single stored publication.
 */
export const ensurePublication = Effect.fn('ensurePublication')(function* ({
  repository,
  date,
  random = Math.random,
}: {
  readonly repository: QuoteRepository;
  readonly date: PublicationDate;
  readonly random?: Random;
}): Effect.fn.Return<Publication, PublicationError> {
  for (let attempt = 1; attempt <= MAX_PUBLISH_ATTEMPTS; attempt++) {
    const existing = yield* repository.findPublication(date);
    if (existing) return existing;

    const snapshot = yield* repository.loadSelectionSnapshot({ recentLimit: ROTATION_LENGTH - 1 });
    const quoteId = selectQuote(snapshot, random);
    if (quoteId === null) return yield* new NoEligibleQuoteError();

    const outcome = yield* repository.publishIfAbsent({ date, quoteId });
    if (outcome) {
      if (outcome.recorded) {
        yield* Effect.logInfo('Published a quote').pipe(
          Effect.annotateLogs({ date, quoteId, attempt }),
        );
      }
      return outcome.publication;
    }
    yield* Effect.logWarning('Chosen quote was disabled before it could be published').pipe(
      Effect.annotateLogs({ date, quoteId, attempt }),
    );
  }
  return yield* new PublicationContendedError({ date, attempts: MAX_PUBLISH_ATTEMPTS });
});

export interface HistoryPage {
  readonly publications: readonly Publication[];
  readonly nextBefore: PublicationDate | null;
}

/** History ends today, so cursors after tomorrow clamp to it. */
export function historyCursor(
  today: PublicationDate,
  before: PublicationDate | undefined,
): PublicationDate {
  const tomorrow = addDays(today, 1);
  return before !== undefined && before < tomorrow ? before : tomorrow;
}

/** Newest first. Publishes today first, so history includes it before anyone has asked for it. */
export const listHistory = Effect.fn('listHistory')(function* ({
  repository,
  today,
  before,
  limit,
  random = Math.random,
}: {
  readonly repository: QuoteRepository;
  readonly today: PublicationDate;
  readonly before?: PublicationDate;
  readonly limit: number;
  readonly random?: Random;
}): Effect.fn.Return<HistoryPage, PublicationError> {
  yield* ensurePublication({ repository, date: today, random });
  const page = yield* repository.listPublications({
    before: historyCursor(today, before),
    limit: limit + 1,
  });
  const publications = page.slice(0, limit);
  return {
    publications,
    nextBefore: page.length > limit ? (publications.at(-1)?.date ?? null) : null,
  };
});
