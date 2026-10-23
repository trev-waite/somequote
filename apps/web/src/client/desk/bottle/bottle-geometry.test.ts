import { describe, expect, it } from 'vitest';
import { DESK_EDGE } from '../desk-geometry';
import type { Point } from '../iso';
import {
  BOTTLE,
  BOTTLE_DURATION,
  type BottlePart,
  bottleAt,
  bottleDrawingAt,
  fallAt,
} from './bottle-geometry';

const pointsOf = (d: string): Point[] =>
  [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map(([, x, y]) => ({ x: Number(x), y: Number(y) }));

const pathsOf = (part: BottlePart): string[] =>
  part.kind === 'solid' ? [part.paths.fill] : [part.d];

function within(ring: readonly Point[], point: Point): boolean {
  let sign = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i] ?? point;
    const b = ring[(i + 1) % ring.length] ?? point;
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (Math.abs(cross / length) < 0.05) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

describe('ship in a bottle', () => {
  it('keeps the ship and its sea inside the glass however far the bottle has rolled', () => {
    for (let ms = 0; ms <= BOTTLE_DURATION.falling; ms += 40) {
      const drawing = bottleDrawingAt(fallAt(ms));
      const glass = pointsOf(drawing.glass);
      const ship = drawing.inside.slice(0, -1);
      for (const point of ship.flatMap(pathsOf).flatMap(pointsOf)) {
        expect(within(glass, point), `at ${ms}ms`).toBe(true);
      }
    }
  });

  it('rolls off the stand toward the reader and comes to rest on the floor past the desk', () => {
    const start = fallAt(0);
    expect(start).toMatchObject({ y: BOTTLE.y, z: BOTTLE.rest });
    expect(start.spin).toBeCloseTo(0);
    const end = fallAt(BOTTLE_DURATION.falling);
    expect(end.y).toBeGreaterThan(DESK_EDGE.front + BOTTLE.radius);
    expect(end.z).toBeCloseTo(DESK_EDGE.floor + BOTTLE.radius);
    expect(end.spin).toBeLessThan(-Math.PI);
    for (let ms = 0; ms <= BOTTLE_DURATION.falling; ms += 10) {
      expect(fallAt(ms).z).toBeGreaterThanOrEqual(DESK_EDGE.floor + BOTTLE.radius - 1e-9);
    }
  });

  it('only cracks once it hits the floor', () => {
    const impact = Array.from({ length: 400 }, (_, i) => i * 10).find(
      (ms) => fallAt(ms).sinceImpact !== undefined,
    );
    if (impact === undefined) throw new Error('never lands');
    const before = bottleDrawingAt(fallAt(impact - 10));
    expect(before.cracks).toEqual({ far: '', near: '' });
    expect(before.shards).toHaveLength(0);
    const after = bottleDrawingAt(fallAt(BOTTLE_DURATION.falling));
    expect(after.cracks.near).not.toBe('');
    expect(after.shards.length).toBeGreaterThan(0);
  });

  it('fades from the floor and back in on its stand', () => {
    expect(bottleAt('broken', 0).opacity).toBe(1);
    expect(bottleAt('fading', BOTTLE_DURATION.fading).opacity).toBe(0);
    expect(bottleAt('fading', 0).pose.z).toBeCloseTo(DESK_EDGE.floor + BOTTLE.radius);
    expect(bottleAt('returning', 0)).toMatchObject({ opacity: 0, pose: { y: BOTTLE.y } });
    expect(bottleAt('returning', BOTTLE_DURATION.returning).opacity).toBe(1);
    expect(bottleDrawingAt(bottleAt('returning', 0).pose).cradleInFront).toBe(true);
  });
});
