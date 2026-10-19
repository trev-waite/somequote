import type { PublicationDate } from './publication-clock';
import { CATEGORIES, type Category, type QuoteId } from './quote';

/**
 * Slots per rotation. Each non-overlapping block of `ROTATION_LENGTH` publications holds this
 * many quotes of each category, in random order, so the published mix stays at 80/20 without a
 * predictable pattern. A rotation is derived from publication history, so no extra state is kept.
 */
export const ROTATION: Readonly<Record<Category, number>> = { general: 4, bible: 1 };

export const ROTATION_LENGTH = CATEGORIES.reduce(
  (total, category) => total + ROTATION[category],
  0,
);

export interface QuoteUsage {
  readonly id: QuoteId;
  readonly category: Category;
  readonly timesPublished: number;
  readonly lastPublishedOn: PublicationDate | null;
}

export interface SelectionSnapshot {
  /** Every enabled quote, with usage derived from publication history. */
  readonly candidates: readonly QuoteUsage[];
  readonly publishedCount: number;
  /** Categories of the latest publications, newest first. At least `ROTATION_LENGTH - 1` when available. */
  readonly recentCategories: readonly Category[];
}

/** Returns a float in [0, 1), like `Math.random`. */
export type Random = () => number;

type NonEmpty<T> = readonly [T, ...T[]];

interface CategoryPool {
  readonly category: Category;
  readonly quotes: NonEmpty<QuoteUsage>;
}

/**
 * Picks the next quote to publish, or `null` when no quote is enabled.
 *
 * 1. Category: a random open slot in the current rotation. If every open slot belongs to a category
 *    with no enabled quotes, the configured mix applies among the categories that have quotes.
 * 2. Quote: the least published in that category, then the least recently published, then random.
 */
export function selectQuote(snapshot: SelectionSnapshot, random: Random): QuoteId | null {
  const pools = poolsByCategory(snapshot.candidates);
  if (!isNonEmpty(pools)) return null;

  const slotsLeft = rotationSlotsLeft(snapshot);
  const open = pools.filter((pool) => slotsLeft(pool.category) > 0);
  const pool = isNonEmpty(open)
    ? pickWeighted(open, (candidate) => slotsLeft(candidate.category), random)
    : pickWeighted(pools, (candidate) => ROTATION[candidate.category], random);

  return pickLeastUsed(pool.quotes, random).id;
}

function poolsByCategory(candidates: readonly QuoteUsage[]): CategoryPool[] {
  return CATEGORIES.flatMap((category) => {
    const quotes = candidates.filter((candidate) => candidate.category === category);
    return isNonEmpty(quotes) ? [{ category, quotes }] : [];
  });
}

function rotationSlotsLeft(snapshot: SelectionSnapshot): (category: Category) => number {
  const position = snapshot.publishedCount % ROTATION_LENGTH;
  const currentRotation = snapshot.recentCategories.slice(0, position);
  return (category) =>
    ROTATION[category] - currentRotation.filter((published) => published === category).length;
}

function pickLeastUsed(quotes: NonEmpty<QuoteUsage>, random: Random): QuoteUsage {
  const leastUsed = quotes.reduce((best, quote) => (compareUsage(quote, best) < 0 ? quote : best));
  const ties = quotes.filter((quote) => compareUsage(quote, leastUsed) === 0);
  return ties[Math.floor(random() * ties.length)] ?? leastUsed;
}

function compareUsage(a: QuoteUsage, b: QuoteUsage): number {
  if (a.timesPublished !== b.timesPublished) return a.timesPublished - b.timesPublished;
  if (a.lastPublishedOn === b.lastPublishedOn) return 0;
  if (a.lastPublishedOn === null) return -1;
  if (b.lastPublishedOn === null) return 1;
  return a.lastPublishedOn < b.lastPublishedOn ? -1 : 1;
}

function pickWeighted<T>(items: NonEmpty<T>, weightOf: (item: T) => number, random: Random): T {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0);
  let remaining = random() * total;
  for (const item of items) {
    remaining -= weightOf(item);
    if (remaining < 0) return item;
  }
  return items.at(-1) ?? items[0];
}

function isNonEmpty<T>(items: readonly T[]): items is NonEmpty<T> {
  return items.length > 0;
}
