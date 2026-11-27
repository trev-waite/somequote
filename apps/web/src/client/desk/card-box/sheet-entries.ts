import { type Favorite, includes } from '../../favorites/favorites';

export type SheetEntry =
  | { readonly kind: 'kept'; readonly favorite: Favorite }
  | { readonly kind: 'removed'; readonly favorite: Favorite };

/** A favorite removed while the sheet is open, and the quotes shown above it then, nearest last. */
export interface Removal {
  readonly favorite: Favorite;
  readonly above: readonly string[];
}

const idOf = (entry: SheetEntry) => entry.favorite.quote.id;

/** Records removing `id` from what is on screen, replacing any earlier removal of the same quote. */
export function withRemoval(
  removals: readonly Removal[],
  entries: readonly SheetEntry[],
  id: string,
): Removal[] {
  const at = entries.findIndex((entry) => idOf(entry) === id);
  const entry = entries[at];
  if (!entry) throw new Error(`No favorite ${id} on the sheet`);
  return [
    ...removals.filter((removal) => removal.favorite.quote.id !== id),
    { favorite: entry.favorite, above: entries.slice(0, at).map(idOf) },
  ];
}

/** Drops the removals whose quotes are favorites again, so a later deletion elsewhere sticks. */
export const stillRemoved = (removals: readonly Removal[], current: readonly Favorite[]) =>
  removals.filter((removal) => !includes(current, removal.favorite.quote.id));

/**
 * The current favorites, with each removal left where it was for undoing: after the nearest quote
 * that was above it and is still shown, or at the top when none is. Placing them in the order they
 * were removed keeps neighbors that share an anchor in their original order.
 */
export function sheetEntries(
  current: readonly Favorite[],
  removals: readonly Removal[],
): SheetEntry[] {
  const entries: SheetEntry[] = current.map((favorite) => ({ kind: 'kept', favorite }));
  for (const removal of stillRemoved(removals, current)) {
    const shown = new Map(entries.map((entry, index) => [idOf(entry), index]));
    const anchor = removal.above.findLast((id) => shown.has(id));
    const at = anchor === undefined ? 0 : (shown.get(anchor) ?? -1) + 1;
    entries.splice(at, 0, { kind: 'removed', favorite: removal.favorite });
  }
  return entries;
}

/** Where an undone removal goes back into the current favorites: after the kept ones above it. */
export function restoreIndex(entries: readonly SheetEntry[], id: string): number {
  const at = entries.findIndex((entry) => idOf(entry) === id);
  return entries.slice(0, Math.max(0, at)).filter((entry) => entry.kind === 'kept').length;
}

const DATE = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export const formatPublicationDate = (date: string) => DATE.format(new Date(`${date}T00:00:00Z`));
