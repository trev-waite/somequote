import { useSyncExternalStore } from 'react';
import { PublicationDto } from '../../shared/api-contract';

/** A favorite keeps the whole publication, so the list reads back without the network. */
export type Favorite = PublicationDto;
type Favorites = readonly Favorite[];

export const FAVORITES_KEY = 'somequote.favorites';

export function parseFavorites(raw: string | null): Favorites {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item: unknown) => {
    const parsed = PublicationDto.safeParse(item);
    if (!parsed.success || seen.has(parsed.data.quote.id)) return [];
    seen.add(parsed.data.quote.id);
    return [parsed.data];
  });
}

export const includes = (list: Favorites, id: string) =>
  list.some((favorite) => favorite.quote.id === id);

export const removeFrom = (list: Favorites, id: string): Favorites =>
  list.filter((favorite) => favorite.quote.id !== id);

export const toggleIn = (list: Favorites, publication: PublicationDto): Favorites =>
  includes(list, publication.quote.id)
    ? removeFrom(list, publication.quote.id)
    : [publication, ...list];

export function restoreTo(list: Favorites, favorite: Favorite, index: number): Favorites {
  if (includes(list, favorite.quote.id)) return list;
  const at = Math.max(0, Math.min(index, list.length));
  return [...list.slice(0, at), favorite, ...list.slice(at)];
}

const listeners = new Set<() => void>();
let snapshot: { readonly raw: string | null; readonly list: Favorites } | undefined;

/** Storage that refuses to be read, as opposed to holding no favorites. */
const UNREADABLE = Symbol('unreadable');
type Saved = string | null | typeof UNREADABLE;

/** The value last read from or written to storage, which a change over a failed read is based on. */
let lastSaved: string | null = null;

/**
 * Holds the list for this visit when storage refuses a write or a read, until another tab saves
 * over the value it was based on.
 */
let unsaved: { readonly raw: string; readonly over: string | null } | undefined;

function savedRaw(): Saved {
  try {
    lastSaved = localStorage.getItem(FAVORITES_KEY);
    return lastSaved;
  } catch {
    return UNREADABLE;
  }
}

function listOver(saved: Saved): Favorites {
  if (saved !== UNREADABLE && unsaved?.over !== saved) unsaved = undefined;
  const raw = unsaved?.raw ?? lastSaved;
  if (!snapshot || snapshot.raw !== raw) snapshot = { raw, list: parseFavorites(raw) };
  return snapshot.list;
}

export const currentFavorites = (): Favorites => listOver(savedRaw());

/** Whether the favorites shown are the ones saved, or include changes this browser refused. */
export const favoritesSaved = () => unsaved === undefined;

/**
 * Changes the list as read once from storage, which is also what a refused write was based on. A
 * change made over a failed read stays in memory rather than replacing a list it never saw.
 */
function update(change: (list: Favorites) => Favorites): void {
  const over = savedRaw();
  const raw = JSON.stringify(change(listOver(over)));
  try {
    if (over === UNREADABLE) throw new Error('Favorites could not be read');
    localStorage.setItem(FAVORITES_KEY, raw);
    lastSaved = raw;
    unsaved = undefined;
  } catch {
    unsaved = { raw, over: lastSaved };
  }
  for (const listener of listeners) listener();
}

const onStorage = (event: StorageEvent) => {
  if (event.key !== FAVORITES_KEY && event.key !== null) return;
  for (const listener of listeners) listener();
};

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

const EMPTY: Favorites = [];

export function useFavorites(): Favorites {
  return useSyncExternalStore(subscribe, currentFavorites, () => EMPTY);
}

export const toggleFavorite = (publication: PublicationDto) =>
  update((list) => toggleIn(list, publication));

export const removeFavorite = (id: string) => update((list) => removeFrom(list, id));

export const restoreFavorite = (favorite: Favorite, index: number) =>
  update((list) => restoreTo(list, favorite, index));
