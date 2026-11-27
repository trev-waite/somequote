import { describe, expect, it } from 'vitest';
import { PublicationDto } from '../../../shared/api-contract';
import { restoreTo } from '../../favorites/favorites';
import {
  formatPublicationDate,
  type Removal,
  restoreIndex,
  type SheetEntry,
  sheetEntries,
  stillRemoved,
  withRemoval,
} from './sheet-entries';

const publication = (id: string, text = 'Text.'): PublicationDto =>
  PublicationDto.parse({
    date: '2026-11-24',
    quote: { category: 'bible', id, text, reference: 'Psalm 23:1', translation: 'WEB' },
  });
const [a, b, c, d, e, f, g] = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => publication(id)) as [
  PublicationDto,
  PublicationDto,
  PublicationDto,
  PublicationDto,
  PublicationDto,
  PublicationDto,
  PublicationDto,
];
const shape = (entries: readonly SheetEntry[]) =>
  entries.map((entry) => `${entry.kind === 'removed' ? '-' : ''}${entry.favorite.quote.id}`);

/** Plays removals and undos as the sheet does: each against what is on screen at the time. */
function session(start: readonly PublicationDto[]) {
  let current = [...start];
  let removals: Removal[] = [];
  const entries = () => sheetEntries(current, removals);
  return {
    entries,
    set: (next: readonly PublicationDto[]) => {
      current = [...next];
      removals = stillRemoved(removals, current);
    },
    remove: (id: string) => {
      removals = withRemoval(removals, entries(), id);
      current = current.filter((favorite) => favorite.quote.id !== id);
    },
    undo: (id: string) => {
      const removal = removals.find((r) => r.favorite.quote.id === id);
      if (!removal) throw new Error(`${id} was not removed`);
      current = [...restoreTo(current, removal.favorite, restoreIndex(entries(), id))];
      removals = removals.filter((r) => r !== removal);
    },
  };
}

describe('sheetEntries', () => {
  it('lists the current favorites', () => {
    expect(shape(sheetEntries([a, b, c], []))).toEqual(['a', 'b', 'c']);
  });

  it('leaves each removal where it was, including runs of neighbors', () => {
    const sheet = session([a, b, c, d]);
    sheet.remove('b');
    expect(shape(sheet.entries())).toEqual(['a', '-b', 'c', 'd']);
    sheet.remove('a');
    sheet.remove('c');
    expect(shape(sheet.entries())).toEqual(['-a', '-b', '-c', 'd']);
  });

  it('restores every removal to the order on screen, in any undo order', () => {
    const sheet = session([a, b, c, d]);
    for (const id of ['b', 'c', 'a']) sheet.remove(id);
    for (const id of ['c', 'a', 'b']) sheet.undo(id);
    expect(shape(sheet.entries())).toEqual(['a', 'b', 'c', 'd']);
  });

  it('can remove and undo a favorite another tab added while the sheet was open', () => {
    const sheet = session([a, b]);
    sheet.set([c, a, b]);
    sheet.remove('c');
    expect(shape(sheet.entries())).toEqual(['-c', 'a', 'b']);
    sheet.undo('c');
    expect(shape(sheet.entries())).toEqual(['c', 'a', 'b']);
  });

  it('shows another tab’s latest copy, and drops a removal that tab added back', () => {
    const sheet = session([a, b]);
    sheet.remove('b');
    sheet.set([a, publication('b', 'Edited.')]);
    expect(shape(sheet.entries())).toEqual(['a', 'b']);
    expect(sheet.entries()[1]?.favorite.quote.text).toBe('Edited.');
  });

  it('keeps a removal whose neighbor another tab removed, at the top', () => {
    const sheet = session([a, b, c]);
    sheet.remove('b');
    sheet.set([c]);
    expect(shape(sheet.entries())).toEqual(['-b', 'c']);
    sheet.undo('b');
    expect(shape(sheet.entries())).toEqual(['b', 'c']);
  });
});

describe('sheetEntries when other tabs change the list', () => {
  it('keeps a run of removals in order, under the nearest favorite still above them', () => {
    const sheet = session([a, b, c, d]);
    sheet.remove('d');
    sheet.remove('c');
    sheet.set([a]);
    expect(shape(sheet.entries())).toEqual(['a', '-c', '-d']);
    sheet.undo('c');
    sheet.undo('d');
    expect(shape(sheet.entries())).toEqual(['a', 'c', 'd']);
  });

  it('shows one removal per quote, even when it is removed again after another tab re-adds it', () => {
    const sheet = session([a, b]);
    sheet.remove('a');
    sheet.set([a, b]);
    sheet.remove('a');
    expect(shape(sheet.entries())).toEqual(['-a', 'b']);
  });
});

describe('sheetEntries when other tabs both add and remove', () => {
  it('forgets an undo once its quote comes back, so a later deletion elsewhere stays deleted', () => {
    const sheet = session([a, b]);
    sheet.remove('a');
    sheet.set([a, b]);
    sheet.set([b]);
    expect(shape(sheet.entries())).toEqual(['b']);
  });

  it('keeps every row in place through an undo after several neighbors vanish', () => {
    const sheet = session([a, b, c, d, e, f, g]);
    for (const id of ['f', 'e', 'c', 'b']) sheet.remove(id);
    sheet.set([g]);
    expect(shape(sheet.entries())).toEqual(['-b', '-c', '-e', '-f', 'g']);
    sheet.undo('e');
    expect(shape(sheet.entries())).toEqual(['-b', '-c', 'e', '-f', 'g']);
  });
});

describe('formatPublicationDate', () => {
  it('names the publication day itself, whatever the reader’s time zone', () => {
    expect(formatPublicationDate('2026-01-01')).toMatch(/2026/);
    expect(formatPublicationDate('2026-01-01')).not.toMatch(/2025/);
  });
});
