import { describe, expect, it } from 'vitest';
import { WIDTH } from './digit-geometry';
import { DIGIT_SWITCHES, layQuote, QUOTE_LINES, SHOWN_AT, SWITCHING } from './quote-letters';

const letters = layQuote((text) => text.length * 8);

describe('laying out the quote over the 404', () => {
  it('places every printed character once, line by line', () => {
    expect(letters.map(({ char }) => char).join('')).toBe(QUOTE_LINES.join('').replaceAll(' ', ''));
  });

  it('centers each line on the 404', () => {
    for (const y of new Set(letters.map((letter) => letter.y))) {
      const line = letters.filter((letter) => letter.y === y);
      const left = Math.min(...line.map(({ x }) => x));
      const right = Math.max(...line.map(({ x }) => x + 8));
      expect((left + right) / 2).toBeCloseTo(WIDTH / 2);
    }
  });

  it('gives each digit the letters in front of it, left to right', () => {
    expect(new Set(letters.map(({ digit }) => digit))).toEqual(new Set([0, 1, 2]));
    for (const y of new Set(letters.map((letter) => letter.y))) {
      const digits = letters.filter((letter) => letter.y === y).map(({ digit }) => digit);
      expect(digits).toEqual([...digits].sort());
    }
  });

  it("sweeps each digit's letters in left to right, each line a little after the one above", () => {
    for (const a of letters) {
      for (const b of letters) {
        if (a.digit !== b.digit || a === b || a.x > b.x || a.y > b.y) continue;
        expect(a.toQuote, `${a.char} before ${b.char}`).toBeLessThanOrEqual(b.toQuote);
      }
    }
  });

  it('drops letters in after their digit pops, and lifts them out before it returns', () => {
    for (const { digit, toQuote, toDigits } of letters) {
      const switches = DIGIT_SWITCHES[digit];
      expect(toQuote).toBeGreaterThan(switches?.toQuote ?? Number.POSITIVE_INFINITY);
      expect(toQuote + SWITCHING.letterMs).toBeLessThanOrEqual(SHOWN_AT);
      expect(toDigits).toBeLessThanOrEqual(switches?.toDigits ?? 0);
    }
  });
});
