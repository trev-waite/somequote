import { describe, expect, it } from 'vitest';
import { airplaneFaces, FLIGHT_DURATION, flightDrawingAt } from './envelope-flight';
import { drawingAt, poseAt } from './envelope-pose';

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
});
