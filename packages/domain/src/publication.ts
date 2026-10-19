import type { PublicationDate } from './publication-clock';
import type { Quote, QuoteId } from './quote';
import { type Random, ROTATION_LENGTH, type SelectionSnapshot, selectQuote } from './selection';

export interface Publication {
  readonly date: PublicationDate;
  readonly quote: Quote;
}

/**
 * Storage for quotes and their permanent publication history. Implementations must enforce at most
 * one publication per date in storage itself; `ensurePublication` relies on that, not on locks.
 */
export interface QuoteRepository {
  findPublication(date: PublicationDate): Promise<Publication | null>;

  /** Reads every selection input from one consistent view of the data. */
  loadSelectionSnapshot(options: { readonly recentLimit: number }): Promise<SelectionSnapshot>;

  /**
   * Atomically records `quoteId` for `date` unless the date already has a publication or the quote
   * is no longer enabled. Resolves to whichever publication holds the date afterwards, possibly a
   * concurrent writer's, or `null` if the date is still empty.
   */
  publishIfAbsent(input: {
    readonly date: PublicationDate;
    readonly quoteId: QuoteId;
  }): Promise<Publication | null>;

  /** Newest first, strictly before `before` when it is set. */
  listPublications(query: {
    readonly before: PublicationDate | null;
    readonly limit: number;
  }): Promise<Publication[]>;
}

export class NoEligibleQuoteError extends Error {
  override readonly name = 'NoEligibleQuoteError';

  constructor() {
    super('No enabled quote is available to publish.');
  }
}

const MAX_PUBLISH_ATTEMPTS = 3;

/**
 * Returns the publication for `date`, selecting and recording one first if none exists. Safe to
 * repeat and to run concurrently: every caller converges on the single stored publication.
 */
export async function ensurePublication({
  repository,
  date,
  random = Math.random,
}: {
  readonly repository: QuoteRepository;
  readonly date: PublicationDate;
  readonly random?: Random;
}): Promise<Publication> {
  for (let attempt = 1; attempt <= MAX_PUBLISH_ATTEMPTS; attempt++) {
    const existing = await repository.findPublication(date);
    if (existing) return existing;

    const snapshot = await repository.loadSelectionSnapshot({ recentLimit: ROTATION_LENGTH - 1 });
    const quoteId = selectQuote(snapshot, random);
    if (quoteId === null) throw new NoEligibleQuoteError();

    const publication = await repository.publishIfAbsent({ date, quoteId });
    if (publication) return publication;
  }
  throw new Error(`Could not publish a quote for ${date} in ${MAX_PUBLISH_ATTEMPTS} attempts.`);
}
