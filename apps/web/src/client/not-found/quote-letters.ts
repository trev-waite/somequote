import { planeMatrix } from '../desk/iso';
import { DEPTH, DIGIT_TARGETS, HEIGHT, WIDTH } from './digit-geometry';

export const QUOTE_LINES = [
  '“Not till we are lost …',
  'do we begin to',
  'find ourselves.”',
] as const;
export const ATTRIBUTION = 'Henry David Thoreau, Walden';
export const LETTER_SIZE = 21;
const LEADING = 26;
const FIRST_BASELINE = 20;

export const FACE_PLANE = planeMatrix([0, DEPTH, HEIGHT], [1, 0, 0], [0, 0, -1]);
export const GROUND_PLANE = planeMatrix([WIDTH / 2, DEPTH + 10, 0], [1, 0, 0], [0, 1, 0]);

/** All timings share the spyglass pickup as their origin. */
export const SWITCHING = {
  start: 1550,
  beat: 900,
  letterMs: 450,
  digitMs: 520,
  holdMs: 8000,
  toQuote: { digit: 120, letters: 420, spread: 420, lineLag: 50 },
  toDigits: { letters: -250, spread: 250, lineLag: 40, digit: 100 },
} as const;

const LAST = DIGIT_TARGETS.length - 1;
const LAST_LINE = QUOTE_LINES.length - 1;
const { toQuote: IN, toDigits: OUT } = SWITCHING;
export const SHOWN_AT =
  SWITCHING.start +
  LAST * SWITCHING.beat +
  IN.letters +
  IN.spread +
  LAST_LINE * IN.lineLag +
  SWITCHING.letterMs;
export const BACK_AT = SHOWN_AT + SWITCHING.holdMs;
/** The spyglass reaches the first digit again a moment after the source starts to fade. */
export const RETURN_AT = BACK_AT + 400;
export const DIGITS_BACK_AT = RETURN_AT + LAST * SWITCHING.beat + OUT.digit + SWITCHING.digitMs;

/** When each digit pops into its letters, from the start, and back out of them, from `BACK_AT`. */
export const DIGIT_SWITCHES = DIGIT_TARGETS.map((_, index) => ({
  toQuote: SWITCHING.start + index * SWITCHING.beat + IN.digit,
  toDigits: RETURN_AT - BACK_AT + index * SWITCHING.beat + OUT.digit,
}));

export interface Letter {
  readonly char: string;
  readonly x: number;
  readonly y: number;
  readonly digit: number;
  readonly toQuote: number;
  readonly toDigits: number;
}

const EDGES = DIGIT_TARGETS.slice(1).map(
  ([x], index) => ((DIGIT_TARGETS[index]?.[0] ?? 0) + x) / 2,
);

export function layQuote(measure: (text: string) => number): Letter[] {
  const placed = QUOTE_LINES.flatMap((text, line) => {
    const start = WIDTH / 2 - measure(text) / 2;
    return [...text].flatMap((char, index) => {
      if (char.trim() === '') return [];
      const x = start + measure(text.slice(0, index));
      const middle = x + measure(char) / 2;
      return [
        {
          char,
          x,
          y: FIRST_BASELINE + line * LEADING,
          line,
          middle,
          digit: EDGES.filter((edge) => middle > edge).length,
        },
      ];
    });
  });
  const shares = placed.map(() => 0);
  DIGIT_TARGETS.forEach((_, digit) => {
    const turn = placed
      .map(({ middle }, index) => ({ middle, index }))
      .filter(({ index }) => placed[index]?.digit === digit)
      .sort((a, b) => a.middle - b.middle);
    turn.forEach(({ index }, rank) => {
      shares[index] = turn.length > 1 ? rank / (turn.length - 1) : 0;
    });
  });
  return placed.map(({ middle: _, line, ...letter }, index) => {
    const share = shares[index] ?? 0;
    const arrival = letter.digit * SWITCHING.beat;
    return {
      ...letter,
      toQuote: SWITCHING.start + arrival + IN.letters + share * IN.spread + line * IN.lineLag,
      toDigits:
        RETURN_AT - BACK_AT + arrival + OUT.letters + share * OUT.spread + line * OUT.lineLag,
    };
  });
}
