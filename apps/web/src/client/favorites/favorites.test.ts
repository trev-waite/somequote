import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicationDto } from '../../shared/api-contract';
import {
  currentFavorites,
  FAVORITES_KEY,
  parseFavorites,
  removeFavorite,
  removeFrom,
  restoreTo,
  toggleFavorite,
  toggleIn,
} from './favorites';

const publication = (id: string, date = '2026-11-24'): PublicationDto =>
  PublicationDto.parse({
    date,
    quote: {
      category: 'general',
      id,
      text: `Quote ${id}.`,
      author: 'An Author',
      source: 'A Source',
    },
  });
const ids = (list: readonly PublicationDto[]) => list.map(({ quote }) => quote.id);

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.setItem(FAVORITES_KEY, '[]');
  currentFavorites();
  localStorage.clear();
});

describe('parseFavorites', () => {
  it('reads nothing from missing, malformed, or non-list storage', () => {
    expect(parseFavorites(null)).toEqual([]);
    expect(parseFavorites('{not json')).toEqual([]);
    expect(parseFavorites('{"date":"2026-11-24"}')).toEqual([]);
  });

  it('keeps each valid publication once and drops entries in the wrong shape', () => {
    const raw = JSON.stringify([
      publication('a'),
      { date: 'yesterday', quote: publication('b').quote },
      publication('a', '2026-11-20'),
      publication('c', '2026-11-19'),
    ]);
    expect(ids(parseFavorites(raw))).toEqual(['a', 'c']);
  });
});

describe('list changes', () => {
  const list = [publication('a'), publication('b'), publication('c')];

  it('toggles a quote in at the front, and out again', () => {
    expect(ids(toggleIn(list, publication('d')))).toEqual(['d', 'a', 'b', 'c']);
    expect(ids(toggleIn(list, publication('b')))).toEqual(['a', 'c']);
  });

  it('restores a removed quote where it was, clamped to the list, and never twice', () => {
    const b = publication('b');
    const without = removeFrom(list, 'b');
    expect(ids(restoreTo(without, b, 1))).toEqual(['a', 'b', 'c']);
    expect(ids(restoreTo(without, b, 9))).toEqual(['a', 'c', 'b']);
    expect(ids(restoreTo(without, b, -1))).toEqual(['b', 'a', 'c']);
    expect(restoreTo(list, b, 0)).toBe(list);
  });
});

describe('the favorites store', () => {
  it('persists changes and returns the same list until storage changes', () => {
    toggleFavorite(publication('a'));
    toggleFavorite(publication('b'));
    expect(ids(parseFavorites(localStorage.getItem(FAVORITES_KEY)))).toEqual(['b', 'a']);
    expect(currentFavorites()).toBe(currentFavorites());
    removeFavorite('b');
    expect(ids(currentFavorites())).toEqual(['a']);
  });

  it('follows another tab’s changes to storage', () => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([publication('z')]));
    expect(ids(currentFavorites())).toEqual(['z']);
  });

  it('lets another tab’s saved list replace a change this tab could not save', () => {
    toggleFavorite(publication('a'));
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    toggleFavorite(publication('today'));
    setItem.mockRestore();
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([publication('b'), publication('a')]));
    window.dispatchEvent(new StorageEvent('storage', { key: FAVORITES_KEY }));
    expect(ids(currentFavorites())).toEqual(['b', 'a']);
    toggleFavorite(publication('today'));
    expect(ids(parseFavorites(localStorage.getItem(FAVORITES_KEY)))).toEqual(['today', 'b', 'a']);
  });

  it('drops a failed change when another tab saved just before it failed', () => {
    toggleFavorite(publication('a'));
    const write = Storage.prototype.setItem;
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      write.call(localStorage, FAVORITES_KEY, JSON.stringify([publication('b'), publication('a')]));
      throw new DOMException('full', 'QuotaExceededError');
    });
    toggleFavorite(publication('today'));
    setItem.mockRestore();
    expect(ids(currentFavorites())).toEqual(['b', 'a']);
    toggleFavorite(publication('today'));
    expect(ids(parseFavorites(localStorage.getItem(FAVORITES_KEY)))).toEqual(['today', 'b', 'a']);
  });

  it('never writes over the saved list from a read that failed', () => {
    toggleFavorite(publication('a'));
    expect(ids(currentFavorites())).toEqual(['a']);
    const getItem = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    toggleFavorite(publication('b'));
    expect(ids(currentFavorites())).toEqual(['b', 'a']);
    getItem.mockRestore();
    expect(ids(parseFavorites(localStorage.getItem(FAVORITES_KEY)))).toEqual(['a']);
  });

  it('works for the visit when storage cannot be read at all', () => {
    const getItem = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    toggleFavorite(publication('a'));
    toggleFavorite(publication('b'));
    expect(ids(currentFavorites())).toEqual(['b', 'a']);
    getItem.mockRestore();
  });

  it('keeps favorites for the visit when storage refuses writes', () => {
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    toggleFavorite(publication('a'));
    expect(localStorage.getItem(FAVORITES_KEY)).toBeNull();
    expect(ids(currentFavorites())).toEqual(['a']);
    setItem.mockRestore();
    toggleFavorite(publication('b'));
    expect(ids(parseFavorites(localStorage.getItem(FAVORITES_KEY)))).toEqual(['b', 'a']);
  });
});
