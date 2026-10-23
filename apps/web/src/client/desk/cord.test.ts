import { describe, expect, it, vi } from 'vitest';
import { CORD, Cord } from './cord';

const anchor = { x: 0, y: 0 };

function hanging(onSwitch = () => undefined) {
  return new Cord(anchor, { onSwitch });
}

function end(cord: Cord) {
  const last = cord.links.at(-1);
  if (!last) throw new Error('cord has no links');
  return last;
}

function settle(cord: Cord, seconds = 4) {
  for (let elapsed = 0; elapsed < seconds && !cord.asleep; elapsed += 1 / 60) cord.advance(1 / 60);
}

describe('Cord', () => {
  it('hangs straight down from its anchor and stays asleep until touched', () => {
    const cord = hanging();
    expect(cord.asleep).toBe(true);
    expect(end(cord)).toMatchObject({ x: 0, y: CORD.length });
  });

  it('clicks the switch once per pull, only once drawn past its resting length', () => {
    const onSwitch = vi.fn();
    const cord = hanging(onSwitch);
    const handle = end(cord);

    expect(cord.grab({ x: handle.x, y: handle.y + 2 })).toBe(true);
    cord.drag({ x: 0, y: handle.y + 2 + CORD.switchAt / 2 });
    expect(onSwitch).not.toHaveBeenCalled();

    cord.drag({ x: 0, y: handle.y + 2 + CORD.switchAt * 3 });
    cord.drag({ x: 0, y: handle.y + 2 + CORD.switchAt * 4 });
    expect(onSwitch).toHaveBeenCalledTimes(1);
    expect(cord.stretch).toBeLessThanOrEqual(CORD.maxStretch);

    cord.release();
    cord.grab(end(cord));
    cord.drag({ x: 0, y: CORD.length + CORD.switchAt * 4 });
    expect(onSwitch).toHaveBeenCalledTimes(2);
  });

  it('retracts and comes to rest after it is let go', () => {
    const cord = hanging();
    cord.grab(end(cord));
    cord.drag({ x: 12, y: CORD.length + 20 });
    settle(cord, 0.2);
    cord.release();
    settle(cord, 10);

    expect(cord.asleep).toBe(true);
    expect(cord.stretch).toBe(0);
    expect(end(cord).x).toBeCloseTo(0, 0);
    expect(end(cord).y).toBeGreaterThan(CORD.length * 0.98);
  });

  it('ignores presses that miss it', () => {
    const cord = hanging();
    expect(cord.grab({ x: CORD.grabRadius * 3, y: CORD.length / 2 })).toBe(false);
    expect(cord.grabbed).toBe(false);
  });

  it('preserves the grip offset instead of jumping to the pointer', () => {
    const cord = hanging();
    const handle = { x: end(cord).x, y: end(cord).y };
    expect(cord.grab({ x: handle.x + 5, y: handle.y + 2 })).toBe(true);
    cord.advance(CORD.stepSeconds);
    expect(end(cord)).toMatchObject(handle);

    cord.drag({ x: handle.x + 7, y: handle.y });
    cord.advance(CORD.stepSeconds);
    expect(end(cord)).toMatchObject({ x: handle.x + 2, y: handle.y - 2 });
  });

  it('is pushed aside by a fingertip swiping through it, however fast', () => {
    const cord = hanging();
    const y = CORD.length * 0.75;
    cord.touch({ x: -20, y });
    cord.touch({ x: 20, y });
    cord.touch(null);
    let furthest = 0;
    for (let step = 0; step < 30; step++) {
      cord.advance(CORD.stepSeconds);
      furthest = Math.max(furthest, ...cord.links.map((link) => link.x));
    }

    expect(furthest).toBeGreaterThan(CORD.fingerRadius / 2);
  });

  it('pulls down visibly before recoiling, without clicking the switch itself', () => {
    const onSwitch = vi.fn();
    const cord = hanging(onSwitch);
    cord.tug();
    cord.advance(1 / 60);
    expect(cord.stretch).toBeGreaterThan(0);
    expect(cord.stretch).toBeLessThan(CORD.switchAt);
    let lowest = 0;
    for (let step = 0; step < 30; step++) {
      cord.advance(CORD.stepSeconds);
      lowest = Math.max(lowest, end(cord).y);
    }

    expect(lowest).toBeGreaterThan(CORD.length + CORD.switchAt);
    expect(onSwitch).not.toHaveBeenCalled();
    settle(cord, 10);
    expect(cord.asleep).toBe(true);
    expect(cord.stretch).toBe(0);
  });

  it('eases back from an automatic tug instead of snapping up', () => {
    const cord = hanging();
    cord.tug();
    const steps = Math.ceil(CORD.tug.seconds / CORD.stepSeconds);
    for (let step = 0; step < steps; step++) cord.advance(CORD.stepSeconds);
    expect(cord.stretch).toBe(CORD.tug.stretch);

    cord.advance(0.08);
    expect(cord.stretch).toBeLessThan(CORD.tug.stretch);
    expect(cord.stretch).toBeGreaterThan(CORD.tug.stretch / 3);
  });

  it('lets a real grab interrupt an automatic tug', () => {
    const cord = hanging();
    cord.tug();
    cord.advance(CORD.tug.seconds / 2);
    cord.grab({ ...end(cord) });
    cord.advance(CORD.stepSeconds);
    const heldStretch = cord.stretch;
    const heldY = end(cord).y;
    settle(cord, 0.3);

    expect(cord.grabbed).toBe(true);
    expect(cord.stretch).toBe(heldStretch);
    expect(end(cord).y).toBe(heldY);
  });
});
