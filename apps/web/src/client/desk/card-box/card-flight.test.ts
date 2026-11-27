import { describe, expect, it } from 'vitest';
import { CARD_MOTION, closingTimes } from './card-flight';

describe('closingTimes', () => {
  it('closes the walls as far into the drop as the lift opens them before its end', () => {
    const { drop, walls } = closingTimes(false);
    const { fade, back, lift, clear } = CARD_MOTION;
    expect(drop).toBeLessThan(fade + back);
    expect(walls - drop).toBe(lift - clear);
    expect(walls).toBeGreaterThan(fade + back - (lift - clear));
  });

  it('drops a card that never left at once, behind the walls', () => {
    expect(closingTimes(true)).toEqual({ drop: 0, walls: 0 });
  });
});
