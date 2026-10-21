import { describe, expect, it } from 'vitest';
import {
  BACK_COVER,
  BOOK,
  BOOK_MIDDLE,
  bookDrawingAt,
  FRONT_COVER,
  nextBookPosition,
} from './book-geometry';

describe('book geometry', () => {
  it('starts with equal stacks and transfers one leaf to the other side', () => {
    const initial = bookDrawingAt(BOOK_MIDDLE);
    expect(initial.left).toBe(initial.right);
    expect(initial.leftHeight).toBe(2);
    expect(initial.rightHeight).toBe(2);
    const next = bookDrawingAt(BOOK_MIDDLE + 1);
    expect(next.left).toBe(initial.left + 1);
    expect(next.right).toBe(initial.right - 1);
    expect(next.leftHeight).toBeGreaterThan(initial.leftHeight);
    expect(next.rightHeight).toBeLessThan(initial.rightHeight);
    expect(bookDrawingAt(nextBookPosition(BOOK_MIDDLE + 1, 'previous'))).toEqual(initial);
  });

  it.each([-1, 1])(
    'accounts for the airborne leaf throughout a turn in direction %s',
    (direction) => {
      for (const progress of [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1]) {
        const drawing = bookDrawingAt(BOOK_MIDDLE, BOOK_MIDDLE + direction, progress);
        expect(drawing.left + drawing.right + drawing.airborne).toBeCloseTo(BOOK.leaves);
        expect(
          drawing.leftHeight + drawing.rightHeight + (drawing.airborne * BOOK.paper) / BOOK.leaves,
        ).toBeCloseTo(BOOK.paper);
        if (progress > 0 && progress < 1) expect(drawing.sheet).toBeDefined();
      }
      const halfway = bookDrawingAt(BOOK_MIDDLE, BOOK_MIDDLE + direction, 0.5);
      expect(halfway.airborne).toBe(1);
    },
  );

  it.each([FRONT_COVER, BACK_COVER])(
    'closes on the cover at %s with the requested title',
    (position) => {
      const drawing = bookDrawingAt(position);
      const words = drawing.cover.flatMap((part) => (part.kind === 'writing' ? [part.text] : []));
      expect(words.join(' ')).toBe(BOOK.title);
      expect(drawing.left + drawing.right).toBe(BOOK.leaves);
      expect(Math.min(drawing.left, drawing.right)).toBe(0);
      const open = position === FRONT_COVER ? 0 : BOOK.leaves;
      expect(bookDrawingAt(open, position, 1)).toEqual(drawing);
      expect(bookDrawingAt(position, open, 1)).toEqual(bookDrawingAt(open));
    },
  );

  it('stops at each cover and allows it to reopen', () => {
    expect(nextBookPosition(FRONT_COVER, 'previous')).toBe(FRONT_COVER);
    expect(nextBookPosition(FRONT_COVER, 'next')).toBe(0);
    expect(nextBookPosition(BACK_COVER, 'next')).toBe(BACK_COVER);
    expect(nextBookPosition(BACK_COVER, 'previous')).toBe(BOOK.leaves);
  });

  it('lights a turning page the same way as the page it lands on', () => {
    type Lit = { kind: string; light?: number; shade?: number };
    const paper = (parts: readonly Lit[]) => parts.filter((part) => part.shade !== undefined);
    const lamp = (parts: readonly Lit[]) =>
      parts.filter((part) => part.kind === 'lit' && part.shade === undefined);
    const mean = (values: readonly number[]) =>
      values.reduce((sum, value) => sum + value, 0) / values.length;

    const landing = bookDrawingAt(BOOK_MIDDLE, BOOK_MIDDLE + 1, 0.97).sheet?.panels ?? [];
    const landed = bookDrawingAt(BOOK_MIDDLE + 1).parts;
    // The covers' light comes first, then each stack's: the left stack is the one turned onto.
    const [, , leftPage] = lamp(landed);
    expect(lamp(landing)[0]?.light).toBeCloseTo(leftPage?.light ?? Number.NaN, 1);
    const leftPaper = paper(landed).slice(0, 12);
    expect(mean(paper(landing).map((part) => part.shade ?? 0))).toBeCloseTo(
      mean(leftPaper.map((part) => part.shade ?? 0)),
      1,
    );

    const upright = bookDrawingAt(BOOK_MIDDLE, BOOK_MIDDLE + 1, 0.4).sheet?.panels ?? [];
    expect(mean(paper(upright).map((part) => part.shade ?? 0))).toBeGreaterThan(
      mean(paper(landing).map((part) => part.shade ?? 0)) + 0.2,
    );
  });
});
