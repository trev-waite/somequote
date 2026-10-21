import { type Part, VIEW_BOX } from './desk-geometry';
import { areaOf, line, type Point, prism, project, rod, SCREEN, type Vec3, vec } from './iso';

/**
 * A reading glass: a round lens in a rim, with a handle. It lies on the desk between the book and
 * the ship in a bottle; picked up, it turns to face the reader, grows nearer, and magnifies.
 */
export const MAGNIFIER = {
  rest: { x: 31, y: 28 },
  /** The handle's direction lying on the desk: toward the reader's right. */
  turn: Math.atan2(0.62, 0.78),
  lens: 6.4,
  rim: 0.9,
  thickness: 1.6,
  ferrule: { length: 2.4, radius: 0.95 },
  handle: { length: 11.5, radius: 1.15 },
  cap: { length: 0.9, radius: 1.3 },
  /** Held up, it is this many times nearer and larger, its handle angled down to the right. */
  held: { size: 3.4, angle: (52 * Math.PI) / 180, magnification: 2.3 },
  liftMs: 700,
  dropMs: 720,
} as const;

/** The glass's own axes: `u` along the handle and `v` across the lens, `n` out of its face. */
export interface MagnifierFrame {
  readonly center: Vec3;
  readonly u: Vec3;
  readonly v: Vec3;
  readonly n: Vec3;
  readonly size: number;
}

type MagnifierPart = Extract<Part, { kind: 'solid' | 'line' }>;

const { lens: LENS, thickness: T } = MAGNIFIER;
const INNER = LENS - MAGNIFIER.rim;
const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: Vec3, b: Vec3, t: number) => vec.add(vec.scale(a, 1 - t), vec.scale(b, t));

const REST: MagnifierFrame = {
  center: [MAGNIFIER.rest.x, MAGNIFIER.rest.y, T / 2],
  u: [Math.cos(MAGNIFIER.turn), Math.sin(MAGNIFIER.turn), 0],
  v: [-Math.sin(MAGNIFIER.turn), Math.cos(MAGNIFIER.turn), 0],
  n: [0, 0, 1],
  size: 1,
};

const HELD_U = vec.add(
  vec.scale(SCREEN.right, Math.cos(MAGNIFIER.held.angle)),
  vec.scale(SCREEN.down, Math.sin(MAGNIFIER.held.angle)),
);
/** Held glasses float in front of the desk; only where they project matters. */
const HELD_BASE: Vec3 = vec.add(REST.center, [0, 0, 30]);
const heldBaseAt = project(HELD_BASE);

/** Where the lens's centre is drawn, lying on the desk. */
export const REST_LENS = project(REST.center);

/** From the lens's centre to the middle of the handle, where a held glass is gripped. */
export const GRIP: Point = (() => {
  const reach =
    (LENS + MAGNIFIER.ferrule.length + MAGNIFIER.handle.length / 2) * MAGNIFIER.held.size;
  return { x: reach * Math.cos(MAGNIFIER.held.angle), y: reach * Math.sin(MAGNIFIER.held.angle) };
})();

/** Keeps a held lens's centre over the drawing, so the glass cannot be lost off its edge. */
export function clampLens({ x, y }: Point): Point {
  const margin = LENS * MAGNIFIER.held.size * 0.4;
  return {
    x: Math.max(VIEW_BOX.x + margin, Math.min(VIEW_BOX.x + VIEW_BOX.width - margin, x)),
    y: Math.max(VIEW_BOX.y + margin, Math.min(VIEW_BOX.y + VIEW_BOX.height - margin, y)),
  };
}

/** Where a glass picked up without being dragged is held: just above where it lay. */
export const HOVER_LENS = clampLens({ x: REST_LENS.x, y: REST_LENS.y - 26 });

/**
 * The glass `lift` of the way from lying on the desk to held up with its lens centred on `lens`
 * (in drawing units): it rises in an arc while it turns to face the reader and comes nearer.
 */
export function magnifierFrameAt(lift: number, lens: Point): MagnifierFrame {
  const e = smooth(Math.max(0, Math.min(1, lift)));
  const held = vec.add(
    HELD_BASE,
    vec.add(
      vec.scale(SCREEN.right, lens.x - heldBaseAt.x),
      vec.scale(SCREEN.down, lens.y - heldBaseAt.y),
    ),
  );
  const n = vec.normalize(mix(REST.n, SCREEN.out, e));
  const along = mix(REST.u, HELD_U, e);
  const u = vec.normalize(vec.sub(along, vec.scale(n, vec.dot(along, n))));
  return {
    center: vec.add(mix(REST.center, held, e), [0, 0, 9 * Math.sin(Math.PI * e)]),
    u,
    v: vec.cross(n, u),
    n,
    size: 1 + (MAGNIFIER.held.size - 1) * e,
  };
}

const cross = (o: Point, a: Point, b: Point) =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** The part of convex polygon `subject` inside convex polygon `clip` (Sutherland–Hodgman). */
function overlap(subject: readonly Point[], clip: readonly Point[]): Point[] {
  const turn = Math.sign(
    clip.reduce((sum, p, i) => sum + cross({ x: 0, y: 0 }, p, clip[(i + 1) % clip.length] ?? p), 0),
  );
  let result = [...subject];
  clip.forEach((a, i) => {
    const b = clip[(i + 1) % clip.length] ?? a;
    const inside = (p: Point) => turn * cross(a, b, p) >= -1e-9;
    const meet = (p: Point, q: Point): Point => {
      const t = cross(a, b, p) / (cross(a, b, p) - cross(a, b, q));
      return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
    };
    const input = result;
    result = [];
    input.forEach((current, j) => {
      const previous = input[(j + input.length - 1) % input.length] ?? current;
      if (inside(current)) {
        if (!inside(previous)) result.push(meet(previous, current));
        result.push(current);
      } else if (inside(previous)) {
        result.push(meet(previous, current));
      }
    });
  });
  return result;
}

export interface MagnifierDrawing {
  /** A soft shadow cast on the desk below a raised glass. */
  readonly shadow: { readonly d: string; readonly opacity: number } | undefined;
  readonly rim: readonly MagnifierPart[];
  readonly lens: {
    /** The opening on the near face of the rim, and on its far face: through both is the lens. */
    readonly near: string;
    readonly far: string;
    /** Where the near and far openings overlap: what can be seen through the glass. */
    readonly opening: readonly Point[];
    readonly center: Point;
  };
  readonly glints: readonly string[];
  readonly handle: readonly MagnifierPart[];
  readonly area: ReturnType<typeof areaOf>;
}

export function magnifierDrawingAt(frame: MagnifierFrame, lift: number): MagnifierDrawing {
  const { center, u, v, n, size } = frame;
  const at = (radius: number, angle: number, height: number): Vec3 =>
    vec.add(
      center,
      vec.scale(
        vec.add(
          vec.add(vec.scale(u, radius * Math.cos(angle)), vec.scale(v, radius * Math.sin(angle))),
          vec.scale(n, height),
        ),
        size,
      ),
    );
  const ring = (radius: number, height: number, steps = 40) =>
    Array.from({ length: steps }, (_, step) => at(radius, (step / steps) * Math.PI * 2, height));
  const arc = (radius: number, from: number, to: number) =>
    line(
      Array.from({ length: 9 }, (_, step) => at(radius, from + ((to - from) * step) / 8, T / 2)),
    );

  const outer = ring(LENS, -T / 2);
  const along = (length: number) => vec.scale(u, length * size);
  const { ferrule, handle: grip, cap } = MAGNIFIER;
  const ferruleAt = at(LENS - 0.3, 0, 0);
  const gripAt = vec.add(ferruleAt, along(ferrule.length));
  const capAt = vec.add(gripAt, along(grip.length));
  const end = vec.add(capAt, along(cap.length));
  /** Rings round the grip, on the side the reader sees. */
  const bands = [0.18, 0.32, 0.46].map((share) => {
    const middle = vec.add(gripAt, along(grip.length * share));
    const side = vec.cross(u, n);
    return line(
      Array.from({ length: 13 }, (_, step) => {
        const angle = (step / 12) * Math.PI - Math.PI / 2;
        const toward = vec.add(
          vec.scale(n, Math.cos(angle) * grip.radius * size * 1.02),
          vec.scale(side, Math.sin(angle) * grip.radius * size * 1.02),
        );
        return vec.add(middle, vec.dot(toward, SCREEN.out) < 0 ? vec.scale(toward, -1) : toward);
      }),
    );
  });

  const e = smooth(Math.max(0, Math.min(1, lift)));
  const outline = [...outer, ...ring(LENS, T / 2), end].map(project);
  return {
    shadow:
      e > 0.01
        ? {
            d: line([...outer, end], true),
            opacity: 0.22 * e,
          }
        : undefined,
    rim: [{ kind: 'solid', paths: prism(outer, vec.scale(n, T * size), 0.25), tone: 'mid' }],
    lens: {
      near: line(ring(INNER, T / 2), true),
      far: line(ring(INNER, -T / 2), true),
      opening: overlap(ring(INNER, T / 2).map(project), ring(INNER, -T / 2).map(project)),
      center: project(at(0, 0, T / 2)),
    },
    glints: [arc(INNER * 0.78, 2.5, 3.35), arc(INNER * 0.78, 3.6, 3.78)],
    handle: [
      {
        kind: 'solid',
        paths: rod(ferruleAt, along(ferrule.length), ferrule.radius * size),
        tone: 'mid',
      },
      { kind: 'solid', paths: rod(gripAt, along(grip.length), grip.radius * size), tone: 'mid' },
      ...bands.map((d): MagnifierPart => ({ kind: 'line', d, tone: 'faint' })),
      { kind: 'solid', paths: rod(capAt, along(cap.length), cap.radius * size), tone: 'mid' },
    ],
    area: areaOf(outline),
  };
}
