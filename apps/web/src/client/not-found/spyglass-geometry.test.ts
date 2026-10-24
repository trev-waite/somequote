import { describe, expect, it } from 'vitest';
import { BACK_AT, DIGIT_SWITCHES, RETURN_AT, SHOWN_AT, SWITCHING } from './quote-letters';
import { LOOK_MS, RESTING, spyglassAt, spyglassDrawingAt } from './spyglass-geometry';

describe('the spyglass looking over the 404', () => {
  it('starts and ends closed and resting on the 0', () => {
    expect(spyglassAt(0)).toEqual(RESTING);
    expect(spyglassAt(LOOK_MS)).toEqual(RESTING);
    expect(spyglassDrawingAt(RESTING).shadow).toBe(1);
  });

  it('rests open at the lookout, off the 0, while the quote is read', () => {
    for (const ms of [SHOWN_AT, (SHOWN_AT + BACK_AT) / 2]) {
      const pose = spyglassAt(ms);
      expect(pose).toMatchObject({ away: 1, extend: 1 });
      expect(spyglassDrawingAt(pose).shadow).toBe(0);
    }
  });

  it('is still looking at each digit when it pops, either way, sweeping left to right', () => {
    DIGIT_SWITCHES.forEach(({ toQuote, toDigits }, index) => {
      const arriving = spyglassAt(SWITCHING.start + index * SWITCHING.beat);
      const returning = spyglassAt(RETURN_AT + index * SWITCHING.beat);
      expect(spyglassAt(toQuote)).toBe(arriving);
      expect(spyglassAt(BACK_AT + toDigits)).toBe(returning);
      expect(returning).toBe(arriving);
    });
    const yaws = DIGIT_SWITCHES.map(({ toQuote }) => spyglassAt(toQuote).yaw);
    expect(yaws).toEqual([...yaws].sort((a, b) => a - b));
  });
});
