import { describe, expect, it } from 'vitest';
import { drawingAt, LIFTED_BOX, OPTION_BOXES, type Phase, poseAt } from './envelope-pose';

const END = Number.POSITIVE_INFINITY;

/** Samples a move every 10ms until it settles. */
function play(phase: Phase) {
  const frames = [];
  for (let ms = 0; ms < 5000; ms += 10) {
    const frame = poseAt(phase, ms);
    frames.push(frame.pose);
    if (frame.next) return { frames, next: frame.next };
  }
  throw new Error(`${phase} never settles`);
}

describe('poseAt', () => {
  it('cycles open, lifted, back on the desk, and straight open again', () => {
    expect(play('lifting').next).toBe('shown');
    expect(play('returning').next).toBe('opening');
    expect(play('opening').next).toBe('open');
  });

  it('starts each move where the last one ended', () => {
    expect(poseAt('lifting', 0).pose).toEqual(poseAt('open', 0).pose);
    expect(poseAt('lifting', END).pose).toEqual(poseAt('shown', 0).pose);
    expect(poseAt('returning', 0).pose).toEqual(poseAt('shown', 0).pose);
    expect(poseAt('returning', END).pose).toEqual({ lift: 0, letter: 0, flap: 1 });
    expect(poseAt('opening', 0).pose).toEqual(poseAt('returning', END).pose);
    expect(poseAt('opening', END).pose).toEqual(poseAt('open', 0).pose);
  });

  it('carries on from wherever an interrupted move had got to', () => {
    const halfLifted = poseAt('lifting', 350).pose;
    expect(poseAt('returning', 0, halfLifted).pose).toEqual(halfLifted);
    expect(poseAt('returning', END, halfLifted).pose).toEqual(poseAt('returning', END).pose);

    const halfOpen = poseAt('opening', 280).pose;
    expect(poseAt('lifting', 0, halfOpen).pose).toEqual(halfOpen);
    expect(poseAt('lifting', END, halfOpen).pose).toEqual(poseAt('shown', 0).pose);
  });

  it('lies on the desk with the flap open and the letter peeking out', () => {
    const { pose } = poseAt('open', 0);
    expect(pose.lift).toBe(0);
    expect(pose.flap).toBe(0);
    expect(pose.letter).toBeGreaterThan(0);
  });

  it('tucks the letter in before folding the flap, and comes down once the flap is mostly shut', () => {
    const { frames } = play('returning');
    for (const { letter, flap, lift } of frames) {
      if (flap > 0) expect(letter).toBe(0);
      if (lift < 1) expect(flap).toBeGreaterThan(0.75);
    }
  });

  it('opens the flap fully before the letter peeks out', () => {
    for (const { letter, flap } of play('opening').frames) {
      if (letter > 0) expect(flap).toBe(0);
    }
  });
});

describe('drawingAt', () => {
  it('shows the inside of the open flap and the outside once it folds over', () => {
    expect(drawingAt(poseAt('open', 0).pose)).toMatchObject({
      flapOver: false,
      flapSide: 'inside',
    });
    expect(drawingAt(poseAt('opening', 0).pose)).toMatchObject({
      flapOver: true,
      flapSide: 'outside',
    });
  });

  it('faces the reader square on once lifted', () => {
    const matrix = drawingAt(poseAt('shown', 0).pose).body.match(/^matrix\((.+)\)$/)?.[1];
    const [a, b, c, d] = matrix?.split(' ').map(Number) ?? [];
    expect(b).toBeCloseTo(0);
    expect(c).toBeCloseTo(0);
    expect(a).toBeCloseTo(d ?? 0);
  });
});

describe('option boxes', () => {
  it('stacks the rows top to bottom inside the lifted envelope', () => {
    const inside = (box: (typeof OPTION_BOXES)[number]) =>
      box.x >= LIFTED_BOX.x &&
      box.y >= LIFTED_BOX.y &&
      box.x + box.width <= LIFTED_BOX.x + LIFTED_BOX.width + 1e-9 &&
      box.y + box.height <= LIFTED_BOX.y + LIFTED_BOX.height + 1e-9;
    expect(OPTION_BOXES).toHaveLength(3);
    expect(OPTION_BOXES.every(inside)).toBe(true);
    for (let row = 1; row < OPTION_BOXES.length; row++) {
      const [above, below] = [OPTION_BOXES[row - 1], OPTION_BOXES[row]];
      expect(below?.y).toBeCloseTo((above?.y ?? 0) + (above?.height ?? 0));
    }
  });
});
