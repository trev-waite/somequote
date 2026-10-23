import { ENVELOPE_SPOT } from '../desk-geometry';
import { planeMatrix, project, SCREEN, type Vec3, vec } from '../iso';

export const ENVELOPE = {
  width: 40,
  height: 27,
  flap: 15,
  letter: { inset: 2, height: 42, travel: 31 },
  lifted: { scale: 3, x: 0, y: 26 },
  hop: 14,
} as const;

export const LETTER_WIDTH = ENVELOPE.width - 2 * ENVELOPE.letter.inset;
export const LETTER_ROWS = { top: 9.4, height: 6.4, count: 3 } as const;
export const LETTER_EXTENSION = 11;
export const LETTER_AIRPLANE = {
  top: LETTER_ROWS.top + LETTER_ROWS.height * LETTER_ROWS.count + 1,
  height: 9.6,
} as const;

export interface Pose {
  readonly lift: number;
  readonly letter: number;
  readonly flap: number;
}

const PEEK = (ENVELOPE.letter.inset + 2) / ENVELOPE.letter.travel;

export type Phase = 'open' | 'lifting' | 'shown' | 'returning' | 'opening';
type Move = 'lifting' | 'returning' | 'opening';

const OPEN: Pose = { lift: 0, letter: PEEK, flap: 0 };
const SHOWN: Pose = { lift: 1, letter: 1, flap: 0 };
const SHUT: Pose = { lift: 0, letter: 0, flap: 1 };

type Track = readonly [startMs: number, durationMs: number];

const MOVES: Record<
  Move,
  {
    readonly from: Pose;
    readonly to: Pose;
    readonly tracks: Partial<Record<keyof Pose, Track>>;
    readonly next: Phase;
  }
> = {
  lifting: {
    from: OPEN,
    to: SHOWN,
    tracks: { flap: [0, 300], lift: [0, 700], letter: [450, 550] },
    next: 'shown',
  },
  returning: {
    from: SHOWN,
    to: SHUT,
    tracks: { letter: [0, 380], flap: [380, 400], lift: [660, 720] },
    next: 'opening',
  },
  opening: {
    from: SHUT,
    to: OPEN,
    tracks: { flap: [0, 560], letter: [560, 320] },
    next: 'open',
  },
};

const smooth = (t: number) => t * t * (3 - 2 * t);

export function poseAt(phase: Phase, elapsedMs: number, from?: Pose): { pose: Pose; next?: Phase } {
  switch (phase) {
    case 'open':
      return { pose: OPEN };
    case 'shown':
      return { pose: SHOWN };
    case 'lifting':
    case 'returning':
    case 'opening': {
      const move = MOVES[phase];
      const start = from ?? move.from;
      let settled = true;
      const part = (key: keyof Pose) => {
        const track = move.tracks[key];
        if (!track) return start[key];
        const t = Math.min(1, Math.max(0, (elapsedMs - track[0]) / track[1]));
        if (t < 1) settled = false;
        return start[key] + (move.to[key] - start[key]) * smooth(t);
      };
      const pose = { lift: part('lift'), letter: part('letter'), flap: part('flap') };
      return settled ? { pose, next: move.next } : { pose };
    }
  }
}

const DESK_U: Vec3 = [Math.cos(ENVELOPE_SPOT.turn), Math.sin(ENVELOPE_SPOT.turn), 0];
const DESK_V: Vec3 = [-Math.sin(ENVELOPE_SPOT.turn), Math.cos(ENVELOPE_SPOT.turn), 0];
const restingAt = project(ENVELOPE_SPOT.center);
const LIFTED_CENTER = vec.add(
  ENVELOPE_SPOT.center,
  vec.add(
    vec.scale(SCREEN.right, ENVELOPE.lifted.x - restingAt.x),
    vec.scale(SCREEN.down, ENVELOPE.lifted.y - restingAt.y),
  ),
);

const mix = (a: Vec3, b: Vec3, t: number) => vec.add(vec.scale(a, 1 - t), vec.scale(b, t));

export function frameAt(lift: number) {
  const u = vec.normalize(mix(DESK_U, SCREEN.right, lift));
  const towardDown = mix(DESK_V, SCREEN.down, lift);
  const v = vec.normalize(vec.sub(towardDown, vec.scale(u, vec.dot(towardDown, u))));
  const size = 1 + (ENVELOPE.lifted.scale - 1) * lift;
  const center = vec.add(mix(ENVELOPE_SPOT.center, LIFTED_CENTER, lift), [
    0,
    0,
    ENVELOPE.hop * Math.sin(Math.PI * lift),
  ]);
  const su = vec.scale(u, size);
  const sv = vec.scale(v, size);
  const origin = vec.sub(
    center,
    vec.add(vec.scale(su, ENVELOPE.width / 2), vec.scale(sv, ENVELOPE.height / 2)),
  );
  return { origin, u: su, v: sv, n: vec.cross(u, v), size };
}

interface EnvelopeDrawing {
  readonly body: string;
  readonly letter: string;
  readonly letterHeight: number;
  readonly flap: string;
  readonly flapOver: boolean;
  readonly flapSide: 'inside' | 'outside';
}

export type EnvelopeFrame = ReturnType<typeof frameAt>;

export function drawingAt(
  { lift, letter, flap }: Pose,
  frame: EnvelopeFrame = frameAt(lift),
): EnvelopeDrawing {
  const { origin, u, v, n, size } = frame;
  const angle = flap * Math.PI;
  const flapV = vec.add(vec.scale(v, -Math.cos(angle)), vec.scale(n, size * Math.sin(angle)));
  const { inset, travel } = ENVELOPE.letter;
  const letterOrigin = vec.add(
    origin,
    vec.add(vec.scale(u, inset), vec.scale(v, inset - letter * travel)),
  );
  return {
    body: planeMatrix(origin, u, v),
    letter: planeMatrix(letterOrigin, u, v),
    letterHeight: Math.max(0, Math.min(ENVELOPE.letter.height, letter * travel - inset)),
    flap: planeMatrix(origin, u, flapV),
    flapOver: flap > 0,
    flapSide: vec.dot(vec.cross(u, flapV), SCREEN.out) < 0 ? 'inside' : 'outside',
  };
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function screenBox(points: readonly Vec3[]): Box {
  const flat = points.map(project);
  const xs = flat.map(({ x }) => x);
  const ys = flat.map(({ y }) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

const atRest = frameAt(0);
const at = (frame: typeof atRest, x: number, y: number) =>
  vec.add(frame.origin, vec.add(vec.scale(frame.u, x), vec.scale(frame.v, y)));

export const RESTING_BOX = screenBox([
  at(atRest, 0, -ENVELOPE.flap),
  at(atRest, ENVELOPE.width, -ENVELOPE.flap),
  at(atRest, 0, ENVELOPE.height),
  at(atRest, ENVELOPE.width, ENVELOPE.height),
]);

const lifted = frameAt(1);
const letterTop = ENVELOPE.letter.inset - ENVELOPE.letter.travel;

export const LIFTED_BOX = screenBox([
  at(lifted, 0, Math.min(letterTop, -ENVELOPE.flap)),
  at(lifted, ENVELOPE.width, ENVELOPE.height),
]);

export const LETTER_PULL_BOX = screenBox([
  at(lifted, ENVELOPE.letter.inset, letterTop),
  at(lifted, ENVELOPE.letter.inset + LETTER_WIDTH, letterTop + LETTER_ROWS.top),
]);

export const AIRPLANE_BOX = screenBox([
  at(lifted, ENVELOPE.letter.inset, letterTop + LETTER_AIRPLANE.top),
  at(
    lifted,
    ENVELOPE.letter.inset + LETTER_WIDTH,
    letterTop + LETTER_AIRPLANE.top + LETTER_AIRPLANE.height,
  ),
]);

export const OPTION_BOXES: readonly Box[] = Array.from({ length: LETTER_ROWS.count }, (_, row) => {
  const top = letterTop + LETTER_ROWS.top + row * LETTER_ROWS.height;
  return screenBox([
    at(lifted, ENVELOPE.letter.inset, top),
    at(lifted, ENVELOPE.letter.inset + LETTER_WIDTH, top + LETTER_ROWS.height),
  ]);
});
