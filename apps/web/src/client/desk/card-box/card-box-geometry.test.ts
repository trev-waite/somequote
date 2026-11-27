import { describe, expect, it } from 'vitest';
import { BOOK_MIDDLE, bookDrawingAt } from '../book/book-geometry';
import { BOTTLE_AREA } from '../bottle/bottle-geometry';
import { CLOCK_FACE, LAMP_BOX, VIEW_BOX } from '../desk-geometry';
import { RESTING_BOX } from '../envelope/envelope-pose';
import { project } from '../iso';
import {
  CARD_BOX,
  CARD_BOX_AREA,
  CARD_FLIGHT,
  cardBoxDrawingFor,
  tabStopFor,
} from './card-box-geometry';

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const cardCount = (count: number) => cardBoxDrawingFor(Array(count).fill(0.5)).cards.length;

describe('cardBoxDrawingFor', () => {
  it('files one card per favorite until the box is full', () => {
    expect([0, 1, 5, CARD_BOX.capacity, 40].map(cardCount)).toEqual([
      0,
      1,
      5,
      CARD_BOX.capacity,
      CARD_BOX.capacity,
    ]);
  });

  it('stands the newest favorite at the front, with its own tab', () => {
    const front = (tabs: number[]) => cardBoxDrawingFor(tabs).cards[1];
    expect(front([0.14, 0.86])).toEqual(front([0.14, 0.5]));
    expect(front([0.14, 0.86])).not.toEqual(front([0.86, 0.14]));
  });

  it('draws only finite paths', () => {
    const drawing = cardBoxDrawingFor(Array(CARD_BOX.capacity).fill(0.14));
    const paths = [
      drawing.hollow,
      drawing.mark,
      ...[...drawing.back, ...drawing.cards, ...drawing.front].map((part) =>
        part.kind === 'line' ? part.d : part.paths.outline,
      ),
    ];
    for (const d of paths) expect(d).not.toMatch(/NaN|Infinity/);
    expect(Object.values(CARD_BOX_AREA.box).every(Number.isFinite)).toBe(true);
    expect(CARD_BOX_AREA.clipPath).not.toMatch(/NaN/);
  });
});

describe('CARD_FLIGHT', () => {
  it('lifts every card clear of the walls, from a finite place in the box', () => {
    expect(CARD_BOX.card.lift).toBeGreaterThan(CARD_BOX.height - CARD_BOX.wall);
    expect(CARD_FLIGHT.lift).toBeLessThan(0);
    expect(CARD_FLIGHT.slots).toHaveLength(CARD_BOX.capacity);
    for (const slot of CARD_FLIGHT.slots) {
      expect([slot.x, slot.y].every(Number.isFinite)).toBe(true);
    }
    expect(Object.values(CARD_FLIGHT.walls).join('')).not.toMatch(/NaN|Infinity/);
  });
});

describe('tabStopFor', () => {
  it('staggers the tabs of neighbouring days and keeps each day’s tab where it was', () => {
    const days = ['2026-11-22', '2026-11-23', '2026-11-24'].map(tabStopFor);
    expect(new Set(days).size).toBe(3);
    expect(tabStopFor('2026-11-25')).toBe(days[0]);
    expect(tabStopFor('1969-12-30')).toBeGreaterThan(0);
  });
});

describe('CARD_BOX_AREA', () => {
  it('stays at least 44px across on the smallest desk, a 320px phone', () => {
    const stage = 320 * 0.94;
    const pxPerUnit = stage / VIEW_BOX.width;
    expect(CARD_BOX_AREA.box.width * pxPerUnit).toBeGreaterThanOrEqual(44);
    expect(CARD_BOX_AREA.box.height * pxPerUnit).toBeGreaterThanOrEqual(44);
  });

  it('keeps its whole rectangle, the part that takes presses, clear of every other control', () => {
    const book = bookDrawingAt(BOOK_MIDDLE);
    const neighbours = {
      lamp: LAMP_BOX,
      envelope: RESTING_BOX,
      bottle: BOTTLE_AREA.box,
      previousPage: book.previous.box,
      nextPage: book.next.box,
    };
    const overlapping = Object.entries(neighbours)
      .filter(([, box]) => overlaps(CARD_BOX_AREA.box, box))
      .map(([name]) => name);
    expect(overlapping).toEqual([]);
  });

  it('stops short of the clock, whose left edge is its front corner', () => {
    const { box } = CARD_BOX_AREA;
    expect(box.x + box.width).toBeLessThan(project(CLOCK_FACE.origin).x);
  });
});
