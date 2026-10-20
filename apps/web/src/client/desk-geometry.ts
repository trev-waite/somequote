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
  | { readonly kind: 'halo'; readonly d: string }
  | {
      readonly kind: 'solid';
      readonly paths: SolidPaths;
      readonly tone: Tone;
      readonly crease?: Tone | 'none';
    }
  | { readonly kind: 'line'; readonly d: string; readonly tone: Tone; readonly dotted?: boolean }
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

const TOP: Plan = { x: -104, y: -52, w: 208, d: 104, r: 3 };
const APRON = insetPlan(TOP, 9);
const APRON_FRONT = APRON.y + APRON.d;
const LEG_FLOOR = -66;

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

const DRAWERS = [
  { x: -86, w: 40 },
  { x: -38, w: 76 },
  { x: 46, w: 40 },
] as const;

function drawers(): Part[] {
  return DRAWERS.flatMap(({ x, w }) => [
    stroke(line(uprightRect(x, APRON_FRONT, -18.5, w, 9, 1), true), 'faint'),
    solid(rod([x + w / 2, APRON_FRONT, -14], [0, 1.6, 0], 1.3), 'mid'),
  ]);
}

function grain(): Part[] {
  return [-44, -36, -21, 3, 29, 44].map((y, index) =>
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

const BOOK = { spine: -14, y0: 9, depth: 32, page: 27, cover: 1.2, edge: 2, rise: 3 } as const;

/** Height of a page's top at `t`, from its outer edge (0) to the gutter (1). */
function pageTop(t: number): number {
  return BOOK.cover + BOOK.edge + BOOK.rise * Math.sin(t * Math.PI * 0.58);
}

function pageBlock(side: -1 | 1): Part[] {
  const outer = BOOK.spine + side * BOOK.page;
  const xAt = (t: number) => outer + (BOOK.spine - outer) * t;
  const samples = Array.from({ length: 13 }, (_, step) => step / 12);
  const profile: Vec3[] = [
    [outer, BOOK.y0, BOOK.cover],
    ...samples.map((t): Vec3 => [xAt(t), BOOK.y0, pageTop(t)]),
    [BOOK.spine, BOOK.y0, BOOK.cover + BOOK.edge + 0.8],
    [BOOK.spine, BOOK.y0, BOOK.cover],
  ];
  const ring = side === 1 ? profile : [...profile].reverse();
  const lines = [0, 1, 2, 3, 4, 5, 6, 7].map((row) => {
    const y = BOOK.y0 + 4.5 + row * 3.2;
    const end = row === 3 || row === 7 ? 0.55 : 0.86;
    const along = samples.filter((t) => t >= 0.1 && t <= end);
    return stroke(line(along.map((t): Vec3 => [xAt(t), y, pageTop(t) + 0.05])), 'lo');
  });
  return [solid(prism(ring, [0, BOOK.depth, 0]), 'mid'), ...lines];
}

function book(): Part[] {
  const front = BOOK.y0 + BOOK.depth;
  return [
    solid(
      slab(
        {
          x: BOOK.spine - BOOK.page - 1.5,
          y: BOOK.y0 - 1.5,
          w: 2 * BOOK.page + 3,
          d: BOOK.depth + 3,
          r: 1,
        },
        0,
        BOOK.cover,
      ),
      'mid',
    ),
    ...pageBlock(-1),
    ...pageBlock(1),
    stroke(
      line([
        [BOOK.spine, front, BOOK.cover + BOOK.edge + 0.8],
        [BOOK.spine + 0.6, front + 1.5, BOOK.cover],
        [BOOK.spine + 2.4, front + 8, 0.1],
      ]),
      'hi',
    ),
  ];
}

const NOTE = { x: 23, y: -7, w: 66, d: 22, z: 0.5, turn: (4 * Math.PI) / 180 } as const;
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
      y: NOTE.d / 2 + 2.1,
      size: 6.5,
    },
  ];
}

/** Where the share envelope lies: front left, clear of the lamp's foot and the book. */
export const ENVELOPE_SPOT = {
  center: [-80, 30, 0.3] satisfies Vec3,
  turn: (-7 * Math.PI) / 180,
} as const;

const LAMP_AT = { x: -50, y: -14 } as const;
const FOOT: Plan = { x: LAMP_AT.x - 27, y: LAMP_AT.y - 19, w: 54, d: 30, r: 6 };
const STEP = insetPlan(FOOT, 5);
const FOOT_TOP = 8;
const POST = { x: LAMP_AT.x, y: LAMP_AT.y - 10, radius: 2.6, top: 66 } as const;
const SHADE = {
  x0: LAMP_AT.x - 40,
  x1: LAMP_AT.x + 40,
  y: LAMP_AT.y - 2,
  z: 76,
  radius: 15,
  sweep: 110,
  band: 3,
} as const;
const SOCKET = { x: LAMP_AT.x - 18, y: LAMP_AT.y + 9, radius: 1.8, z: 67 } as const;

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
    solid(slab(FOOT, 0, 5, 1), 'mid'),
    solid(slab(STEP, 5, FOOT_TOP - 5, 0.7), 'mid'),
    solid(cylinder(POST.x, POST.y, 6.5, FOOT_TOP, 4, 0.6), 'mid'),
    stroke(knurl(POST.x, POST.y, 6.5, FOOT_TOP, FOOT_TOP + 4, 28), 'faint'),
    solid(cylinder(POST.x, POST.y, POST.radius, FOOT_TOP + 4, POST.top - FOOT_TOP - 4), 'mid'),
    stroke(sideArc(POST.x, POST.y, POST.radius, 34), 'faint'),
    solid(cylinder(POST.x, POST.y, 4, POST.top - 8, 4, 0.4), 'mid'),
    solid(cylinder(SOCKET.x, SOCKET.y, SOCKET.radius, SOCKET.z, 4.5), 'mid'),
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
  x0: 23,
  yBack: -36,
  yFront: -16,
  z0: 2.5,
  width: 62,
  height: 34,
  radius: 7,
} as const;
const CLOCK_TOP = CLOCK.z0 + CLOCK.height;
const CARD = { width: 16, height: 23, top: 5.5, gap: 2.4 } as const;
const cardsWidth = 3 * CARD.width + 2 * CARD.gap;

function clock(): Part[] {
  const { x0, yBack, yFront, z0, width, height, radius } = CLOCK;
  const body = uprightRect(x0, yBack, z0, width, height, radius);
  return [
    ...[x0 + 7, x0 + width - 12].map((x) =>
      solid(slab({ x, y: yBack + 2.5, w: 5, d: yFront - yBack - 5, r: 1.3 }, 0, z0), 'lo'),
    ),
    solid(prism(body, [0, yFront - yBack, 0]), 'mid'),
    stroke(
      line(uprightRect(x0 + 1.9, yFront, z0 + 1.9, width - 3.8, height - 3.8, radius - 1.7), true),
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
  solid(slab(insetPlan(TOP, 2.5), -7, 2), 'lo'),
  solid(slab(TOP, -5, 5, 1.2), 'mid'),
  ...grain(),
  ...note(),
  ...book(),
  { kind: 'light', layer: 'pool' },
  ...lamp(),
  ...clock(),
];

/** Where the pull chain hangs from: the bottom of the switch socket under the front rim. */
export const CORD_ANCHOR = project([SOCKET.x, SOCKET.y, SOCKET.z]);

const rimStart = project(shadeAt(SHADE.x0 + SHADE.band, SHADE.sweep));
const rimEnd = project(shadeAt(SHADE.x1 - SHADE.band, SHADE.sweep));
const poolCenter = project([LAMP_AT.x, LAMP_AT.y + 8, 0]);
const POOL_RADIUS = 56;

export const LAMP_LIGHT = {
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
