import { ENVELOPE_SPOT } from './desk-geometry';
import { ENVELOPE, type EnvelopeFrame, frameAt, type Pose, poseAt } from './envelope-pose';
import { depthOf, line, SCREEN, type Vec3, vec } from './iso';

export type FlightStage = 'folding' | 'flying' | 'away' | 'landing';

export const FLIGHT_DURATION: Record<FlightStage, number> = {
  folding: 1500,
  flying: 5600,
  away: 5000,
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
const ROUTE: readonly Vec3[] = [
  LAUNCH,
  [-20, 75, 38],
  [100, 30, 50],
  [70, -65, 100],
  [-40, -65, 95],
  [-105, -20, 48],
];

/** A Catmull–Rom route keeps the aircraft's heading continuous through the turns. */
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

function flyingFrame(progress: number, exitX: number): EnvelopeFrame {
  const center = routeAt(progress, exitX);
  const forward = vec.normalize(
    vec.sub(routeAt(progress + 0.002, exitX), routeAt(progress - 0.002, exitX)),
  );
  const v = vec.scale(forward, -1);
  const right = vec.normalize(vec.cross([0, 0, 1], forward));
  const up = vec.cross(right, v);
  const bank = Math.sin(progress * Math.PI * 2) * 0.5;
  const u = vec.add(vec.scale(right, Math.cos(bank)), vec.scale(up, Math.sin(bank)));
  return makeFrame(center, u, v, 1.15);
}

export interface FlightDrawing {
  readonly frame: EnvelopeFrame;
  readonly pose: Pose;
  /** 0 is the envelope rectangle; 1 is the folded aircraft. */
  readonly fold: number;
  readonly plane: boolean;
}

export function flightDrawingAt(stage: FlightStage, elapsed: number, exitX: number): FlightDrawing {
  const t = clamp(elapsed / FLIGHT_DURATION[stage]);
  const open = poseAt('open', 0).pose;
  switch (stage) {
    case 'folding': {
      const fold = smooth(clamp((elapsed - 600) / 900));
      return {
        frame: blendFrame(frameAt(1), flyingFrame(0, exitX), smooth(clamp((elapsed - 250) / 1250))),
        pose: {
          lift: 1,
          letter: 1 - smooth(clamp(elapsed / 380)),
          flap: smooth(clamp((elapsed - 260) / 340)),
        },
        fold,
        plane: fold > 0,
      };
    }
    case 'flying':
    case 'away':
      return {
        frame: flyingFrame(stage === 'away' ? 1 : t, exitX),
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
      return { frame: makeFrame(center, u, v, 1), pose: open, fold: 0, plane: false };
    }
  }
}

const { width: W, height: H } = ENVELOPE;
const NOSE: Vec3 = [0, -H / 2, 0];
const TAIL: Vec3 = [0, H / 2, 0];
const LEFT_TOP: Vec3 = [-W / 2, -H / 2, 0];
const LEFT_BOTTOM: Vec3 = [-W / 2, H / 2, 0];
const RIGHT_TOP: Vec3 = [W / 2, -H / 2, 0];
const RIGHT_BOTTOM: Vec3 = [W / 2, H / 2, 0];
const PAPER_FACES: readonly (readonly Vec3[])[] = [
  [NOSE, LEFT_TOP, LEFT_BOTTOM],
  [NOSE, LEFT_BOTTOM, TAIL],
  [NOSE, TAIL, RIGHT_BOTTOM],
  [NOSE, RIGHT_BOTTOM, RIGHT_TOP],
];
const PLANE_FACES: readonly (readonly Vec3[])[] = [
  [
    [0, -26, 0],
    [-23, 16, 2],
    [-5, 9, -1],
  ],
  [
    [0, -26, 0],
    [-5, 9, -1],
    [0, 15, -5],
  ],
  [
    [0, -26, 0],
    [0, 15, -5],
    [5, 9, -1],
  ],
  [
    [0, -26, 0],
    [5, 9, -1],
    [23, 16, 2],
  ],
];

/** The same four paper panels fold into wings and a keel, then travel in the desk's world space. */
export function airplaneFaces({ frame, fold }: FlightDrawing) {
  const center = centerOf(frame);
  return PAPER_FACES.map((face, index) => {
    const folded = PLANE_FACES[index] ?? face;
    const points = face.map((point, corner) => {
      const [x, y, z] = mix(point, folded[corner] ?? point, fold);
      return vec.add(
        center,
        vec.add(
          vec.add(vec.scale(frame.u, x), vec.scale(frame.v, y)),
          vec.scale(frame.n, z * frame.size),
        ),
      );
    });
    return {
      index,
      d: line(points, true),
      shadow: line(
        points.map(([x, y]): Vec3 => [x, y, 0.1]),
        true,
      ),
      depth: depthOf(vec.scale(points.reduce<Vec3>(vec.add, [0, 0, 0]), 1 / points.length)),
    };
  }).sort((a, b) => a.depth - b.depth);
}
