import { describe, expect, it } from 'vitest';
import { airplaneFaces, FLIGHT_DURATION, flightDrawingAt } from './envelope-flight';
import { drawingAt, poseAt } from './envelope-pose';
import { vec } from './iso';

const EXIT_X = -500;

describe('envelope flight', () => {
  it('starts at the lifted envelope and lands at its original open pose', () => {
    const start = flightDrawingAt('folding', 0, EXIT_X);
    expect(drawingAt(start.pose, start.frame)).toEqual(drawingAt(poseAt('shown', 0).pose));
    const end = flightDrawingAt('landing', FLIGHT_DURATION.landing, EXIT_X);
    expect(drawingAt(end.pose, end.frame)).toEqual(drawingAt(poseAt('open', 0).pose));
  });

  it('keeps every panel continuous from folding to flight and fully offscreen while away', () => {
    const folded = flightDrawingAt('folding', FLIGHT_DURATION.folding, EXIT_X);
    const takeoff = flightDrawingAt('flying', 0, EXIT_X);
    expect(airplaneFaces(folded)).toEqual(airplaneFaces(takeoff));
    const gone = airplaneFaces(flightDrawingAt('away', 0, EXIT_X));
    for (const { d } of gone) {
      const xs = [...d.matchAll(/[ML](-?[\d.]+) /g)].map((match) => Number(match[1]));
      expect(Math.max(...xs)).toBeLessThan(EXIT_X + 50);
    }
  });

  it('tucks the extended letter in continuously and carries the light back to its resting position', () => {
    expect(flightDrawingAt('folding', 0, EXIT_X, 1.35).pose.letter).toBe(1.35);
    const falling = flightDrawingAt('landing', FLIGHT_DURATION.landing / 2, EXIT_X);
    expect(falling.lightOffset?.y).toBeLessThan(0);
    expect(flightDrawingAt('landing', FLIGHT_DURATION.landing, EXIT_X).lightOffset).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('keeps the falling envelope unlit above the shade and fades in below it', () => {
    const lightAt = (progress: number) =>
      flightDrawingAt('landing', FLIGHT_DURATION.landing * progress, EXIT_X).lightOpacity;
    const samples = Array.from({ length: 101 }, (_, i) => lightAt(i / 100) ?? Number.NaN);
    expect(samples[0]).toBe(0);
    expect(samples[40]).toBe(0);
    expect(samples.at(-1)).toBe(1);
    expect(samples.some((light) => light > 0 && light < 1)).toBe(true);
    samples.slice(1).forEach((light, i) => {
      expect(light).toBeGreaterThanOrEqual(samples[i] ?? Number.NaN);
    });
  });

  it('folds without spinning: the paper turns only a little between frames', () => {
    const angle = (a: readonly [number, number, number], b: readonly [number, number, number]) =>
      Math.acos(Math.min(1, vec.dot(vec.normalize(a), vec.normalize(b))));
    for (let elapsed = 16; elapsed <= FLIGHT_DURATION.folding; elapsed += 16) {
      const before = flightDrawingAt('folding', elapsed - 16, EXIT_X).frame;
      const after = flightDrawingAt('folding', elapsed, EXIT_X).frame;
      expect(angle(before.u, after.u)).toBeLessThan(0.05);
      expect(angle(before.n, after.n)).toBeLessThan(0.05);
    }
  });

  it('starts the fold as flat, unshaded paper', () => {
    const start = airplaneFaces(flightDrawingAt('folding', 610, EXIT_X));
    for (const { shade } of start) expect(shade).toBeLessThan(0.01);
    const folded = airplaneFaces(flightDrawingAt('folding', FLIGHT_DURATION.folding, EXIT_X));
    expect(Math.max(...folded.map(({ shade }) => shade))).toBeGreaterThan(0.1);
  });

  it('gathers speed after the throw rather than leaving at full speed', () => {
    const centreAt = (elapsed: number) => {
      const { frame } = flightDrawingAt('flying', elapsed, EXIT_X);
      return vec.add(frame.origin, vec.add(vec.scale(frame.u, 20), vec.scale(frame.v, 13.5)));
    };
    const step = (elapsed: number) =>
      Math.hypot(...vec.sub(centreAt(elapsed + 16), centreAt(elapsed)));
    expect(step(0)).toBeLessThan(step(FLIGHT_DURATION.flying * 0.3) / 10);
  });
});
