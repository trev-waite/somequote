import {
  corners,
  cylinder,
  depthOf,
  hull,
  insetPlan,
  knurl,
  line,
  type Plan,
  type Point,
  planeMatrix,
  prism,
  project,
  rod,
  round,
  roundedPlan,
  type SolidPaths,
  sideArc,
  slab,
  uprightRect,
  type Vec3,
  vec,
} from './iso';

export type { Point } from './iso';

export type Tone = 'hi' | 'mid' | 'lo' | 'faint';

export type Part =
  | { readonly kind: 'book' }
  | { readonly kind: 'drawer' }
  | { readonly kind: 'halo'; readonly d: string }
  | {
      readonly kind: 'solid';
      readonly paths: SolidPaths;
      readonly tone: Tone;
      readonly crease?: Tone | 'none';
    }
  | { readonly kind: 'line'; readonly d: string; readonly tone: Tone; readonly dotted?: boolean }
  /**
   * A face lit by the lamp: `light` is how strongly the lamp's pool falls on it (1 for a surface
   * lying flat on the desk). With a `shade`, it is also painted as paper turned that far from the lamp.
   */
  | { readonly kind: 'lit'; readonly d: string; readonly light: number; readonly shade?: number }
  | { readonly kind: 'light'; readonly layer: 'pool' | 'glow' }
  | {
      readonly kind: 'writing';
      readonly text: string;
      /** Places the text in the plane of the surface it is written on. */
      readonly transform: string;
      readonly x: number;
      readonly y: number;
      readonly size: number;
    };

const solid = (paths: SolidPaths, tone: Tone, crease?: Tone | 'none'): Part =>
  crease ? { kind: 'solid', paths, tone, crease } : { kind: 'solid', paths, tone };
const stroke = (d: string, tone: Tone, dotted = false): Part =>
  dotted ? { kind: 'line', d, tone, dotted } : { kind: 'line', d, tone };

const TOP: Plan = { x: -112, y: -56, w: 224, d: 112, r: 3 };
const APRON = insetPlan(TOP, 9);
/** The plane of the drawer fronts. */
export const APRON_FRONT = APRON.y + APRON.d;
const LEG_FLOOR = -66;

/** Where things that fall off the desk go: over its front edge, down to the floor. */
export const DESK_EDGE = { front: TOP.y + TOP.d, floor: LEG_FLOOR } as const;

function legs(): Part[] {
  return corners(APRON, 2.5)
    .sort(([ax, ay], [bx, by]) => depthOf([ax, ay, 0]) - depthOf([bx, by, 0]))
    .flatMap(([x, y]) => [
      solid(slab({ x: x - 1.9, y: y - 1.9, w: 3.8, d: 3.8, r: 0.6 }, LEG_FLOOR, 4), 'lo'),
      solid(
        slab({ x: x - 2.3, y: y - 2.3, w: 4.6, d: 4.6, r: 0.8 }, LEG_FLOOR + 4, -25 - LEG_FLOOR),
        'mid',
      ),
      solid(slab({ x: x - 2.8, y: y - 2.8, w: 5.6, d: 5.6, r: 0.8 }, -25, 4), 'mid'),
    ]);
}

/** Every drawer front: `x` and `w` along the apron, `z` and `h` up it. */
export const DRAWER_FACE = { z: -18.5, h: 9, knob: { z: -14, length: 1.6, radius: 1.3 } } as const;
/** The centre drawer opens; the two beside it are only drawn. */
export const CENTER_DRAWER = { x: -42, w: 84 } as const;
const SIDE_DRAWERS = [
  { x: -94, w: 44 },
  { x: 50, w: 44 },
] as const;

function drawers(): Part[] {
  return SIDE_DRAWERS.flatMap(({ x, w }) => [
    stroke(line(uprightRect(x, APRON_FRONT, DRAWER_FACE.z, w, DRAWER_FACE.h, 1), true), 'faint'),
    solid(
      rod(
        [x + w / 2, APRON_FRONT, DRAWER_FACE.knob.z],
        [0, DRAWER_FACE.knob.length, 0],
        DRAWER_FACE.knob.radius,
      ),
      'mid',
    ),
  ]);
}

function grain(): Part[] {
  return [-47, -39, -23, 3, 31, 47].map((y, index) =>
    stroke(
      line(
        Array.from({ length: 41 }, (_, step): Vec3 => {
          const x = TOP.x + 1.5 + ((TOP.w - 3) * step) / 40;
          return [x, y + 0.9 * Math.sin(x / (11 + index * 3) + index), 0];
        }),
      ),
      'faint',
    ),
  );
}

const NOTE = { x: 30, y: -15, w: 66, d: 22, z: 0.5, turn: (4 * Math.PI) / 180 } as const;
const noteU: Vec3 = [Math.cos(NOTE.turn), Math.sin(NOTE.turn), 0];
const noteV: Vec3 = [-Math.sin(NOTE.turn), Math.cos(NOTE.turn), 0];
const noteAt = (u: number, v: number, z: number): Vec3 =>
  vec.add([NOTE.x, NOTE.y, z], vec.add(vec.scale(noteU, u), vec.scale(noteV, v)));

function note(): Part[] {
  const sheet = prism(
    [noteAt(0, 0, 0), noteAt(NOTE.w, 0, 0), noteAt(NOTE.w, NOTE.d, 0), noteAt(0, NOTE.d, 0)],
    [0, 0, NOTE.z],
  );
  return [
    solid(sheet, 'lo', 'none'),
    {
      kind: 'writing',
      text: 'until the next quote',
      transform: planeMatrix(noteAt(0, 0, NOTE.z), noteU, noteV),
      x: NOTE.w / 2,
      y: NOTE.d / 2 + 2.3,
      size: 7.2,
    },
  ];
}

/** Where the share envelope lies: front left, clear of the lamp's foot and the book. */
export const ENVELOPE_SPOT = {
  center: [-88, 32, 0.3] satisfies Vec3,
  turn: (-7 * Math.PI) / 180,
} as const;

const LAMP_AT = { x: -54, y: -18 } as const;
/** The lamp is drawn a little large for the desk, but not so large it crowds it. */
const l = (size: number) => size * 0.84;
const FOOT: Plan = { x: LAMP_AT.x - l(27), y: LAMP_AT.y - l(19), w: l(54), d: l(30), r: l(6) };
const STEP = insetPlan(FOOT, l(5));
const FOOT_TOP = l(8);
const POST = { x: LAMP_AT.x, y: LAMP_AT.y - l(10), radius: l(2.6), top: l(66) } as const;
const SHADE = {
  x0: LAMP_AT.x - l(40),
  x1: LAMP_AT.x + l(40),
  y: LAMP_AT.y - l(2),
  z: l(76),
  radius: l(15),
  sweep: 110,
  band: l(3),
} as const;
const SOCKET = {
  x: LAMP_AT.x - l(18),
  y: LAMP_AT.y + l(9),
  radius: l(1.8),
  z: l(67),
  height: l(4.5),
} as const;

function shadeAt(x: number, degrees: number, radius: number = SHADE.radius): Vec3 {
  const angle = (degrees * Math.PI) / 180;
  return [x, SHADE.y + radius * Math.sin(angle), SHADE.z + radius * Math.cos(angle)];
}

/** The shade's D-shaped cross-section at `x`: the curved glass, closed underneath by a chord. */
function shadeSection(x: number, radius: number, steps = 22): Vec3[] {
  return Array.from({ length: steps + 1 }, (_, step) =>
    shadeAt(x, -SHADE.sweep + (2 * SHADE.sweep * step) / steps, radius),
  );
}

function lamp(): Part[] {
  const length = SHADE.x1 - SHADE.x0 - 2 * SHADE.band;
  return [
    solid(slab(FOOT, 0, l(5), 1), 'mid'),
    solid(slab(STEP, l(5), FOOT_TOP - l(5), 0.7), 'mid'),
    solid(cylinder(POST.x, POST.y, l(6.5), FOOT_TOP, l(4), 0.6), 'mid'),
    stroke(knurl(POST.x, POST.y, l(6.5), FOOT_TOP, FOOT_TOP + l(4), 28), 'faint'),
    solid(
      cylinder(POST.x, POST.y, POST.radius, FOOT_TOP + l(4), POST.top - FOOT_TOP - l(4)),
      'mid',
    ),
    stroke(sideArc(POST.x, POST.y, POST.radius, l(34)), 'faint'),
    solid(cylinder(POST.x, POST.y, l(4), POST.top - l(8), l(4), 0.4), 'mid'),
    solid(cylinder(SOCKET.x, SOCKET.y, SOCKET.radius, SOCKET.z, SOCKET.height), 'mid'),
    { kind: 'light', layer: 'glow' },
    solid(prism(shadeSection(SHADE.x0, SHADE.radius + 0.8), [SHADE.band, 0, 0]), 'mid'),
    solid(prism(shadeSection(SHADE.x0 + SHADE.band, SHADE.radius), [length, 0, 0]), 'hi'),
    ...[-30, 20, 70].map((degrees) =>
      stroke(
        line([shadeAt(SHADE.x0 + SHADE.band, degrees), shadeAt(SHADE.x1 - SHADE.band, degrees)]),
        'faint',
      ),
    ),
    solid(
      prism(shadeSection(SHADE.x1 - SHADE.band, SHADE.radius + 0.8), [SHADE.band, 0, 0]),
      'mid',
    ),
  ];
}

const CLOCK = {
  x0: 40,
  yBack: -46,
  yFront: -29,
  z0: 2.2,
  width: 54,
  height: 30,
  radius: 6,
} as const;
const CLOCK_TOP = CLOCK.z0 + CLOCK.height;
const CARD = { width: 14, height: 20, top: 4.8, gap: 2.1 } as const;
const cardsWidth = 3 * CARD.width + 2 * CARD.gap;

function clock(): Part[] {
  const { x0, yBack, yFront, z0, width, height, radius } = CLOCK;
  const body = uprightRect(x0, yBack, z0, width, height, radius);
  return [
    ...[x0 + 6, x0 + width - 10.4].map((x) =>
      solid(slab({ x, y: yBack + 2.2, w: 4.4, d: yFront - yBack - 4.4, r: 1.1 }, 0, z0), 'lo'),
    ),
    solid(prism(body, [0, yFront - yBack, 0]), 'mid'),
    stroke(
      line(uprightRect(x0 + 1.7, yFront, z0 + 1.7, width - 3.4, height - 3.4, radius - 1.5), true),
      'faint',
    ),
  ];
}

/** The clock face, for drawing its cards: `origin` is the face's top left; u runs right, v down. */
export const CLOCK_FACE = {
  origin: [CLOCK.x0, CLOCK.yFront, CLOCK_TOP] satisfies Vec3,
  u: [1, 0, 0] satisfies Vec3,
  v: [0, 0, -1] satisfies Vec3,
  /** Out of the face, toward the reader: where a falling flap swings. */
  normal: [0, 1, 0] satisfies Vec3,
  window: {
    x: (CLOCK.width - cardsWidth) / 2 - 1.4,
    y: CARD.top - 1.4,
    width: cardsWidth + 2.8,
    height: CARD.height + 2.8,
  },
  cards: [0, 1, 2].map((index) => ({
    x: (CLOCK.width - cardsWidth) / 2 + index * (CARD.width + CARD.gap),
    y: CARD.top,
  })),
  card: { width: CARD.width, height: CARD.height },
} as const;

export const DESK_PARTS: readonly Part[] = [
  { kind: 'halo', d: slab(APRON, LEG_FLOOR - 4, 2).fill },
  ...legs(),
  solid(slab(APRON, -21, 14), 'mid'),
  ...drawers(),
  { kind: 'drawer' },
  solid(slab(insetPlan(TOP, 2.5), -7, 2), 'lo'),
  solid(slab(TOP, -5, 5, 1.2), 'mid'),
  ...grain(),
  ...note(),
  { kind: 'light', layer: 'pool' },
  // The book lights its own pages, which turn and curve, so it comes after the pool.
  { kind: 'book' },
  ...lamp(),
  ...clock(),
];

/** Where the pull chain hangs from: the bottom of the switch socket under the front rim. */
export const CORD_ANCHOR = project([SOCKET.x, SOCKET.y, SOCKET.z]);

/** The bulb inside the shade, where the lamp's light comes from. */
const BULB: Vec3 = [LAMP_AT.x, SHADE.y + l(4), SHADE.z - l(7)];

/** How directly a face at `point` with outward `normal` faces the bulb, relative to lying flat. */
function facingLamp(point: Vec3, normal: Vec3): number {
  const toward = vec.normalize(vec.sub(BULB, point));
  return Math.max(0, vec.dot(vec.normalize(normal), toward)) / toward[2];
}

/** The lamp's light on a face, as a multiple of the pool on the desk below it. */
export const lampLightOn = (point: Vec3, normal: Vec3) => Math.min(1.3, facingLamp(point, normal));

/** Paper from white, lying flat, toward the darkest side shade as it turns away from the lamp. */
export const paperShade = (point: Vec3, normal: Vec3) =>
  0.6 * Math.max(0, Math.min(1, 1 - facingLamp(point, normal)));

const rimStart = project(shadeAt(SHADE.x0 + SHADE.band, SHADE.sweep));
const rimEnd = project(shadeAt(SHADE.x1 - SHADE.band, SHADE.sweep));
const poolCenter = project([LAMP_AT.x, LAMP_AT.y + 8, 0]);
const POOL_RADIUS = 54;

export const LAMP_LIGHT = {
  /** Height of the shade's open rim above the desktop. */
  height: shadeAt(SHADE.x0, SHADE.sweep)[2],
  /** The pool of light the lamp throws on the desk, clipped to the desk's top. */
  pool: {
    cx: round(poolCenter.x),
    cy: round(poolCenter.y),
    rx: round(POOL_RADIUS * 1.15),
    ry: round(POOL_RADIUS * 0.55),
    clip: line(roundedPlan(TOP, 0), true),
  },
  /** The front rim of the glass, where light spills from under the shade. */
  rim: `M${round(rimStart.x)} ${round(rimStart.y)}L${round(rimEnd.x)} ${round(rimEnd.y)}`,
} as const;

function boxOf(points: readonly Point[], pad: number) {
  const xs = points.map(({ x }) => x);
  const ys = points.map(({ y }) => y);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return {
    x: round(x),
    y: round(y),
    width: round(Math.max(...xs) + pad - x),
    height: round(Math.max(...ys) + pad - y),
  };
}

const shadeOutline = [
  ...shadeSection(SHADE.x0, SHADE.radius + 0.8),
  ...shadeSection(SHADE.x1, SHADE.radius + 0.8),
];

/** The lamp's own area, which switches it when clicked or tapped. */
export const LAMP_BOX = boxOf(hull([...roundedPlan(FOOT, 0), ...shadeOutline].map(project)), 2);

export const VIEW_BOX = boxOf(
  [
    ...roundedPlan(TOP, 0),
    ...roundedPlan(APRON, LEG_FLOOR),
    ...shadeOutline,
    ...uprightRect(CLOCK.x0, CLOCK.yFront, CLOCK.z0, CLOCK.width, CLOCK.height, 0),
  ].map(project),
  8,
);

/** Places an HTML overlay over a region of the drawing given in viewBox units, within `frame`. */
export function overlay(
  { x, y, width, height }: ReturnType<typeof boxOf>,
  frame: ReturnType<typeof boxOf> = VIEW_BOX,
) {
  return {
    left: `${((x - frame.x) / frame.width) * 100}%`,
    top: `${((y - frame.y) / frame.height) * 100}%`,
    width: `${(width / frame.width) * 100}%`,
    height: `${(height / frame.height) * 100}%`,
  };
}
