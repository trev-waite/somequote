import { ENVELOPE_SPOT, LAMP_LIGHT } from './desk-geometry';
import { ENVELOPE, type EnvelopeFrame, frameAt, type Pose, poseAt } from './envelope-pose';
import { depthOf, LIGHT, line, type Point, project, round, SCREEN, type Vec3, vec } from './iso';

export type FlightStage = 'folding' | 'flying' | 'away' | 'landing';

export const FLIGHT_DURATION: Record<FlightStage, number> = {
  folding: 1500,
  flying: 5600,
  away: 3000,
  landing: 3400,
};

export const NEXT_FLIGHT_STAGE: Record<FlightStage, FlightStage | undefined> = {
  folding: 'flying',
  flying: 'away',
  away: 'landing',
  landing: undefined,
};

const clamp = (t: number) => Math.max(0, Math.min(1, t));
const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => vec.add(vec.scale(a, 1 - t), vec.scale(b, t));

function makeFrame(center: Vec3, u: Vec3, v: Vec3, size: number): EnvelopeFrame {
  const su = vec.scale(u, size);
  const sv = vec.scale(v, size);
  return {
    origin: vec.sub(
      center,
      vec.add(vec.scale(su, ENVELOPE.width / 2), vec.scale(sv, ENVELOPE.height / 2)),
    ),
    u: su,
    v: sv,
    n: vec.cross(u, v),
    size,
  };
}

function centerOf(frame: EnvelopeFrame): Vec3 {
  return vec.add(
    frame.origin,
    vec.add(vec.scale(frame.u, ENVELOPE.width / 2), vec.scale(frame.v, ENVELOPE.height / 2)),
  );
}

function blendFrame(a: EnvelopeFrame, b: EnvelopeFrame, t: number): EnvelopeFrame {
  const u = vec.normalize(mix(vec.normalize(a.u), vec.normalize(b.u), t));
  const down = mix(vec.normalize(a.v), vec.normalize(b.v), t);
  const v = vec.normalize(vec.sub(down, vec.scale(u, vec.dot(down, u))));
  return makeFrame(mix(centerOf(a), centerOf(b), t), u, v, a.size + (b.size - a.size) * t);
}

const LAUNCH: Vec3 = [-65, 30, 48];
/**
 * The aircraft leaves nose first, away from the reader, so the paper only tips back to lie along
 * its heading; a launch toward the reader would have to spin it half a turn mid-fold.
 */
const ROUTE: readonly Vec3[] = [
  LAUNCH,
  [-105, -20, 48],
  [-40, -65, 95],
  [70, -65, 100],
  [100, 30, 50],
  [-20, 75, 38],
];
const THROW = 0.12;
const launched = (t: number) =>
  (t < THROW ? (t * t) / (2 * THROW) : t - THROW / 2) / (1 - THROW / 2);

function routeAt(progress: number, exitX: number): Vec3 {
  const end: Vec3 = vec.add([-90, -10, 60], vec.scale(SCREEN.right, exitX + 65));
  const points = [...ROUTE, end];
  const segment = clamp(progress) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(segment));
  const t = segment - index;
  const b = points[index] ?? LAUNCH;
  const c = points[index + 1] ?? end;
  const a = points[index - 1] ?? vec.sub(vec.scale(b, 2), c);
  const d = points[index + 2] ?? vec.sub(vec.scale(c, 2), b);
  const t2 = t * t;
  const t3 = t2 * t;
  return vec.scale(
    vec.add(
      vec.add(vec.scale(b, 2), vec.scale(vec.sub(c, a), t)),
      vec.add(
        vec.scale(
          vec.add(vec.sub(vec.scale(a, 2), vec.scale(b, 5)), vec.sub(vec.scale(c, 4), d)),
          t2,
        ),
        vec.scale(vec.add(vec.sub(vec.scale(b, 3), a), vec.sub(d, vec.scale(c, 3))), t3),
      ),
    ),
    0.5,
  );
}

const BANKING = 30;

function flyingFrame(progress: number, exitX: number): EnvelopeFrame {
  const behind = routeAt(progress - 0.002, exitX);
  const center = routeAt(progress, exitX);
  const ahead = routeAt(progress + 0.002, exitX);
  const travel = vec.sub(ahead, behind);
  const forward = vec.normalize(travel);
  const v = vec.scale(forward, -1);
  const right = vec.normalize(vec.cross([0, 0, 1], forward));
  const up = vec.cross(right, v);
  const curvature =
    (4 * vec.dot(vec.add(vec.sub(ahead, center), vec.sub(behind, center)), right)) /
    vec.dot(travel, travel);
  const bank = -Math.atan(curvature * BANKING);
  const u = vec.add(vec.scale(right, Math.cos(bank)), vec.scale(up, Math.sin(bank)));
  return makeFrame(center, u, v, 1.15);
}

interface FlightDrawing {
  readonly frame: EnvelopeFrame;
  readonly pose: Pose;
  readonly fold: number;
  readonly plane: boolean;
  readonly lightOffset?: Point;
  readonly lightOpacity?: number;
}

export function flightDrawingAt(
  stage: FlightStage,
  elapsed: number,
  exitX: number,
  letter = 1,
): FlightDrawing {
  const t = clamp(elapsed / FLIGHT_DURATION[stage]);
  const open = poseAt('open', 0).pose;
  switch (stage) {
    case 'folding': {
      const fold = smooth(clamp((elapsed - 600) / 900));
      return {
        frame: blendFrame(frameAt(1), flyingFrame(0, exitX), smooth(clamp((elapsed - 250) / 1250))),
        pose: {
          lift: 1,
          letter: letter * (1 - smooth(clamp(elapsed / 380))),
          flap: smooth(clamp((elapsed - 260) / 340)),
        },
        fold,
        plane: fold > 0,
      };
    }
    case 'flying':
    case 'away':
      return {
        frame: flyingFrame(stage === 'away' ? 1 : launched(t), exitX),
        pose: open,
        fold: 1,
        plane: true,
      };
    case 'landing': {
      const remaining = 1 - t;
      const sway = Math.sin(t * Math.PI * 5) * remaining;
      const turn = ENVELOPE_SPOT.turn + sway * 0.65;
      const u: Vec3 = vec.normalize([Math.cos(turn), Math.sin(turn), sway * 0.35]);
      const v = vec.normalize(vec.cross(vec.normalize([-u[0] * u[2], -u[1] * u[2], 1]), u));
      const center = vec.add(ENVELOPE_SPOT.center, [
        sway * 26,
        Math.sin(t * Math.PI * 4) * remaining * 12,
        remaining * remaining * 230,
      ]);
      const frame = makeFrame(center, u, v, 1);
      const highestPoint =
        frame.origin[2] +
        Math.max(0, frame.u[2] * ENVELOPE.width) +
        Math.max(-frame.v[2] * ENVELOPE.flap, frame.v[2] * ENVELOPE.height);
      return {
        frame,
        pose: open,
        fold: 0,
        plane: false,
        lightOffset: project(vec.sub(center, ENVELOPE_SPOT.center)),
        lightOpacity: smooth(clamp((LAMP_LIGHT.height - highestPoint) / 14)),
      };
    }
  }
}

const { width: W, height: H } = ENVELOPE;

interface Corner {
  readonly paper: Vec3;
  readonly plane: Vec3;
  readonly span: readonly [start: number, end: number];
  readonly via?: Vec3;
}

const CORNERS: readonly Corner[] = [
  { paper: [0, -H / 2, 0], plane: [0, -26, 0], span: [0, 0.75] },
  { paper: [-W / 2, -H / 2, 0], plane: [-23, 16, 2], span: [0.3, 1], via: [-6, -4, 14] },
  { paper: [-W / 2, H / 2, 0], plane: [-5, 9, -1], span: [0, 0.6], via: [-12, 12, 4] },
  { paper: [0, H / 2, 0], plane: [0, 15, -5], span: [0, 0.55] },
  { paper: [W / 2, H / 2, 0], plane: [5, 9, -1], span: [0, 0.6], via: [12, 12, 4] },
  { paper: [W / 2, -H / 2, 0], plane: [23, 16, 2], span: [0.3, 1], via: [6, -4, 14] },
];
const PANELS = [
  [0, 1, 2],
  [0, 2, 3],
  [0, 3, 4],
  [0, 4, 5],
] as const;

function cornerAt({ paper, plane, span, via }: Corner, fold: number): Vec3 {
  const t = smooth(clamp((fold - span[0]) / (span[1] - span[0])));
  if (!via) return mix(paper, plane, t);
  return mix(mix(paper, via, t), mix(via, plane, t), t);
}

export function airplaneFaces({ frame, fold }: FlightDrawing) {
  const center = centerOf(frame);
  const corners = CORNERS.map((corner) => {
    const [x, y, z] = cornerAt(corner, fold);
    return vec.add(
      center,
      vec.add(
        vec.add(vec.scale(frame.u, x), vec.scale(frame.v, y)),
        vec.scale(frame.n, z * frame.size),
      ),
    );
  });
  return PANELS.map((panel, index) => {
    const points = panel.map((corner) => corners[corner] ?? center);
    const [a = center, b = center, c = center] = points;
    const normal = vec.normalize(vec.cross(vec.sub(b, a), vec.sub(c, a)));
    const facing = vec.dot(normal, SCREEN.out) < 0 ? vec.scale(normal, -1) : normal;
    return {
      index,
      d: line(points, true),
      shadow: line(
        points.map(([x, y]): Vec3 => [x, y, 0.1]),
        true,
      ),
      shade: round(fold * (1 - vec.dot(facing, LIGHT)) * 0.5),
      depth: round(depthOf(vec.scale(vec.add(vec.add(a, b), c), 1 / 3))),
    };
  }).sort((a, b) => a.depth - b.depth);
}
