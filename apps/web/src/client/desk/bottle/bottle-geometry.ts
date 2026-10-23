import { DESK_EDGE, type Part } from '../desk-geometry';
import {
  areaOf,
  circle,
  hull,
  LIGHT,
  line,
  pathOf,
  prism,
  project,
  rod,
  SCREEN,
  slab,
  type Vec3,
  vec,
} from '../iso';

export const BOTTLE = {
  x: 82,
  y: 39,
  radius: 6,
  rest: 9,
} as const;

export type BottleStage = 'standing' | 'falling' | 'broken' | 'fading' | 'returning';

const R = BOTTLE.radius;
const BOTTLE_INSIDE = R - 0.5;
const FLOOR_REST = DESK_EDGE.floor + R;

const clamp = (t: number) => Math.max(0, Math.min(1, t));
const smooth = (t: number) => t * t * (3 - 2 * t);

const STAND = {
  base: { x: BOTTLE.x - 17, y: BOTTLE.y - 7.5, w: 30, d: 15, r: 1.5 },
  height: 2.4,
  cradles: [-13, 4],
  thickness: 2.2,
  top: 5.6,
} as const;

const TOUCH = (230 * Math.PI) / 180;

function wedge(side: -1 | 1, a: number): Vec3[] {
  const touch = { out: -R * Math.cos(TOUCH), z: BOTTLE.rest + R * Math.sin(TOUCH) };
  const slope = Math.abs(Math.tan(TOUCH));
  const foot = touch.out - (touch.z - STAND.height) * slope;
  const crest = touch.out + (STAND.top - touch.z) * slope;
  const outer = BOTTLE.y - STAND.base.y - 0.5;
  const x = BOTTLE.x + a - STAND.thickness / 2;
  const y = (out: number) => BOTTLE.y + side * out;
  return [
    [x, y(outer), STAND.height],
    [x, y(foot), STAND.height],
    [x, y(crest), STAND.top],
    [x, y(outer), STAND.top],
  ];
}

const LIP = {
  y: wedge(1, 0)[2]?.[1] ?? BOTTLE.y,
  edge: wedge(1, 0)[3]?.[1] ?? BOTTLE.y,
  z: STAND.top + R,
} as const;

const GRAVITY = 600;
const SPEED = 30;
const WOBBLE_MS = 300;
const PUSH_MS = ((2 * (LIP.edge - BOTTLE.y)) / SPEED) * 1000;
const DROP_MS = Math.sqrt((2 * (LIP.z - R)) / GRAVITY) * 1000;
const DESK_Y = LIP.edge + (SPEED * DROP_MS) / 1000;
const ROLL_MS = ((DESK_EDGE.front - DESK_Y) / SPEED) * 1000;
const FALL_MS = Math.sqrt((2 * (R - FLOOR_REST)) / GRAVITY) * 1000;
const LANDING_Y = DESK_EDGE.front + (SPEED * FALL_MS) / 1000;
const IMPACT_MS = WOBBLE_MS + PUSH_MS + DROP_MS + ROLL_MS + FALL_MS;
const SETTLE_MS = 650;
const SKID = 0.12;

export const BOTTLE_DURATION: Record<BottleStage, number> = {
  standing: 0,
  falling: IMPACT_MS + SETTLE_MS,
  broken: 3000,
  fading: 650,
  returning: 650,
};

export const NEXT_BOTTLE_STAGE: Record<BottleStage, BottleStage> = {
  standing: 'standing',
  falling: 'broken',
  broken: 'fading',
  fading: 'returning',
  returning: 'standing',
};

function standHeight(y: number): number {
  if (y <= BOTTLE.y) return BOTTLE.rest;
  return BOTTLE.rest + (LIP.z - BOTTLE.rest) * smooth(clamp((y - BOTTLE.y) / (LIP.y - BOTTLE.y)));
}

interface BottlePose {
  readonly y: number;
  readonly z: number;
  readonly spin: number;
  readonly sinceImpact: number | undefined;
}

const posed = (y: number, z: number, sinceImpact?: number): BottlePose => ({
  y,
  z,
  spin: -(y - BOTTLE.y) / R,
  sinceImpact,
});

export function fallAt(ms: number): BottlePose {
  let t = Math.max(0, ms);
  if (t < WOBBLE_MS) {
    const rock = -0.9 * Math.sin((2 * Math.PI * t) / WOBBLE_MS);
    return posed(BOTTLE.y + rock, BOTTLE.rest + 0.25 * rock * rock);
  }
  t -= WOBBLE_MS;
  if (t < PUSH_MS) {
    const y = BOTTLE.y + (LIP.edge - BOTTLE.y) * (t / PUSH_MS) ** 2;
    return posed(y, y < LIP.y ? standHeight(y) : LIP.z);
  }
  t -= PUSH_MS;
  if (t < DROP_MS) {
    const s = t / 1000;
    return posed(LIP.edge + SPEED * s, LIP.z - (GRAVITY * s * s) / 2);
  }
  t -= DROP_MS;
  if (t < ROLL_MS) return posed(DESK_Y + (SPEED * t) / 1000, R);
  t -= ROLL_MS;
  if (t < FALL_MS) {
    const s = t / 1000;
    return posed(DESK_EDGE.front + SPEED * s, R - (GRAVITY * s * s) / 2);
  }
  t -= FALL_MS;
  const bounce =
    t < 170
      ? 2.2 * Math.sin((Math.PI * t) / 170)
      : t < 260
        ? 0.5 * Math.sin((Math.PI * (t - 170)) / 90)
        : 0;
  return posed(LANDING_Y + SPEED * SKID * (1 - Math.exp(-t / 1000 / SKID)), FLOOR_REST + bounce, t);
}

const RESTING = posed(BOTTLE.y, BOTTLE.rest);

export function bottleAt(
  stage: BottleStage,
  elapsed: number,
): { pose: BottlePose; opacity: number } {
  switch (stage) {
    case 'standing':
      return { pose: RESTING, opacity: 1 };
    case 'falling':
      return { pose: fallAt(elapsed), opacity: 1 };
    case 'broken':
      return { pose: fallAt(BOTTLE_DURATION.falling), opacity: 1 };
    case 'fading':
      return {
        pose: fallAt(BOTTLE_DURATION.falling),
        opacity: 1 - smooth(clamp(elapsed / BOTTLE_DURATION.fading)),
      };
    case 'returning':
      return { pose: RESTING, opacity: smooth(clamp(elapsed / BOTTLE_DURATION.returning)) };
  }
}

function random(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Crack = readonly (readonly [a: number, s: number])[];

function crackStar(seed: number, branches: number, reach: number): Crack[] {
  const next = random(seed);
  const lines: [number, number][][] = [];
  const grow = (from: [number, number], heading: number, length: number, forks: number) => {
    const points: [number, number][] = [from];
    let [a, s] = from;
    let turn = heading;
    for (let travelled = 0; travelled < length; travelled += 1.3) {
      turn += (next() - 0.5) * 0.9;
      a += 1.3 * Math.cos(turn);
      s += 1.3 * Math.sin(turn);
      points.push([a, s]);
      if (forks > 0 && travelled > length * 0.4 && next() < 0.3) {
        grow([a, s], turn + (next() < 0.5 ? -0.8 : 0.8), length * 0.45, forks - 1);
      }
    }
    lines.push(points);
  };
  for (let branch = 0; branch < branches; branch++) {
    grow([0, 0], (branch / branches) * Math.PI * 2 + next() * 0.6, reach * (0.5 + next()), 1);
  }
  return lines;
}

const STARS = [
  { a: -5, facing: 'floor', turn: 0, cracks: crackStar(7, 7, 10) },
  { a: -9, facing: 'reader', turn: 0.15, cracks: crackStar(11, 6, 7) },
  { a: 3, facing: 'reader', turn: -0.35, cracks: crackStar(19, 5, 5) },
] as const;
const CRACK_MS = 160;

const SHARDS = (() => {
  const next = random(23);
  return Array.from({ length: 8 }, (_, index) => ({
    heading: (index / 8) * Math.PI * 2 + next() * 0.5,
    distance: 7 + next() * 9,
    size: 0.9 + next() * 1.1,
    spin: (next() - 0.5) * 5,
    corners: [0, 2.1 + next() * 0.8, 4.1 + next() * 0.8],
  }));
})();

const PROFILE = [
  [-19, 5.2],
  [-18.3, R],
  [9, R],
  [11.6, 4.6],
  [14, 2.7],
  [19.6, 2.85],
  [20.6, 2.85],
] as const;
const CORK = { from: 17, length: 6.4, radius: 2.05 } as const;

export type BottlePart =
  | Extract<Part, { kind: 'solid' | 'line' }>
  | { readonly kind: 'sail' | 'flag' | 'sea'; readonly d: string };

const solid = (paths: ReturnType<typeof prism>, tone: 'mid' | 'lo' = 'mid'): BottlePart => ({
  kind: 'solid',
  paths,
  tone,
});
const stroke = (d: string, tone: 'hi' | 'mid' | 'lo' | 'faint', dotted = false): BottlePart =>
  dotted ? { kind: 'line', d, tone, dotted } : { kind: 'line', d, tone };

interface Rig {
  readonly a: number;
  readonly top: number;
  readonly sails: readonly (readonly [
    foot: number,
    head: number,
    footHalf: number,
    headHalf: number,
  ])[];
}

const MASTS: readonly Rig[] = [
  {
    a: -8,
    top: 4,
    sails: [
      [0.4, 2.1, 2.3, 2.0],
      [2.4, 3.6, 1.8, 1.4],
    ],
  },
  {
    a: -3,
    top: 4.9,
    sails: [
      [0.4, 2.4, 3.0, 2.7],
      [2.7, 4.3, 2.2, 1.7],
    ],
  },
  {
    a: 2,
    top: 4.6,
    sails: [
      [0.4, 2.3, 2.7, 2.4],
      [2.6, 4.0, 2.0, 1.6],
    ],
  },
];
const BELLY = 0.7;
const BOWSPRIT: readonly [Vec3, Vec3] = [
  [7.4, 0, 0],
  [11.8, 0, 1.3],
];
const DECK = -0.2;
const HULL_HALF = 1.5;

function shipParts(toWorld: (local: Vec3) => Vec3): BottlePart[] {
  const across = toWorld;
  const along = (local: Vec3) => vec.sub(toWorld(local), toWorld([0, 0, 0]));
  const facing = (normal: Vec3) => vec.dot(along(normal), SCREEN.out) > 0;
  const path = (points: readonly Vec3[], closed = false) => line(points.map(across), closed);

  const sea = Math.asin(2.6 / BOTTLE_INSIDE);
  const putty = Array.from({ length: 11 }, (_, step): Vec3 => {
    const angle = Math.PI + sea + ((Math.PI - 2 * sea) * step) / 10;
    return [-16, BOTTLE_INSIDE * Math.cos(angle), BOTTLE_INSIDE * Math.sin(angle)];
  });
  const upright = facing([0, 0, 1]);
  const waves = [-3, -0.6, 2.4].map((p, row) =>
    stroke(
      path(
        Array.from({ length: 15 }, (_, step): Vec3 => {
          const a = -15 + step * 1.45 + row * 0.7;
          return [a, p + 0.3 * Math.sin(a * 1.4 + row * 2), -2.58];
        }),
      ),
      'faint',
    ),
  );
  const surface = [putty[0], putty.at(-1)].flatMap((edge) =>
    edge ? [edge, vec.add(edge, [22, 0, 0])] : [],
  );
  const [s0, s1, s2, s3] = surface;
  const sea0: BottlePart[] = [
    solid(prism(putty.map(across), along([22, 0, 0])), 'lo'),
    ...(upright && s0 && s1 && s2 && s3
      ? [{ kind: 'sea' as const, d: path([s0, s1, s3, s2], true) }, ...waves]
      : []),
  ];

  const side = facing([0, 1, 0]) ? HULL_HALF : -HULL_HALF;
  const hull: BottlePart[] = [
    solid(
      prism(
        (
          [
            [-12.2, DECK],
            [-11.2, -2.8],
            [2.4, -2.8],
            [7.2, -0.6],
            [7.6, 0.2],
          ] as const
        ).map(([a, q]) => across([a, -HULL_HALF, q])),
        along([0, 2 * HULL_HALF, 0]),
      ),
    ),
    solid(
      prism(
        (
          [
            [-12.4, DECK],
            [-12.6, 0.9],
            [-9.4, 0.9],
            [-9.4, DECK],
          ] as const
        ).map(([a, q]) => across([a, -1.3, q])),
        along([0, 2.6, 0]),
      ),
    ),
    stroke(
      path([
        [-11.6, side * 1.01, -1.2],
        [5, side * 1.01, -1.2],
      ]),
      'mid',
    ),
    stroke(
      path([
        [-10, side * 1.01, -1.85],
        [2.6, side * 1.01, -1.85],
      ]),
      'hi',
      true,
    ),
  ];

  const rig: BottlePart[] = [];
  for (const mast of MASTS) {
    for (const p of [-HULL_HALF, HULL_HALF]) {
      for (const lean of [-0.7, 0.7]) {
        rig.push(
          stroke(
            path([
              [mast.a + lean, p, DECK],
              [mast.a, 0, mast.top * 0.72],
            ]),
            'faint',
          ),
        );
      }
    }
    rig.push(
      stroke(
        path([
          [mast.a, 0, DECK],
          [mast.a, 0, mast.top],
        ]),
        'hi',
      ),
    );
    for (const [foot, head, footHalf, headHalf] of mast.sails) {
      const at = (s: number, t: number): Vec3 => [
        mast.a + BELLY * (1 - s * s) * Math.sin((t * Math.PI) / 2),
        s * (headHalf + (footHalf - headHalf) * t),
        head + (foot - head) * t,
      ];
      const outline = [
        at(-1, 0),
        at(1, 0),
        at(1, 1),
        ...Array.from({ length: 9 }, (_, step) => at(1 - (2 * (step + 1)) / 10, 1)),
        at(-1, 1),
      ];
      rig.push({ kind: 'sail', d: path(outline, true) });
      for (const s of [-0.35, 0.35]) {
        rig.push(
          stroke(path(Array.from({ length: 5 }, (_, step) => at(s, (step + 1) / 6))), 'faint'),
        );
      }
      rig.push(
        stroke(
          path([
            [mast.a, -(headHalf + 0.4), head],
            [mast.a, headHalf + 0.4, head],
          ]),
          'mid',
        ),
      );
    }
    rig.push({
      kind: 'flag',
      d: path(
        [
          [mast.a, 0, mast.top],
          [mast.a + 2, 0, mast.top - 0.25],
          [mast.a, 0, mast.top - 0.6],
        ],
        true,
      ),
    });
  }
  const [fore, main, mizzen] = [MASTS[2], MASTS[1], MASTS[0]];
  if (fore && main && mizzen) {
    rig.push(
      stroke(path(BOWSPRIT), 'mid'),
      stroke(
        path([
          [main.a, 0, main.top],
          [fore.a, 0, fore.top * 0.75],
        ]),
        'faint',
      ),
      stroke(
        path([
          [mizzen.a, 0, mizzen.top],
          [main.a, 0, main.top * 0.6],
        ]),
        'faint',
      ),
      stroke(
        path([
          [mizzen.a, 0, mizzen.top],
          [-12.5, 0, 0.9],
        ]),
        'faint',
      ),
      stroke(path([[fore.a, 0, fore.top], BOWSPRIT[1]]), 'faint'),
      {
        kind: 'sail',
        d: path(
          [
            [3.2, 0, 3.6],
            [11.4, 0, 1.25],
            [5.2, 0, 0.5],
          ],
          true,
        ),
      },
    );
  }
  return upright ? [...sea0, ...hull, ...rig] : [...rig, ...hull, ...sea0];
}

interface BottleDrawing {
  readonly shadow: { readonly d: string; readonly opacity: number } | undefined;
  readonly shards: readonly string[];
  readonly stand: readonly BottlePart[];
  readonly cradle: readonly BottlePart[];
  readonly cradleInFront: boolean;
  readonly glass: string;
  readonly cracks: { readonly far: string; readonly near: string };
  readonly inside: readonly BottlePart[];
  readonly rims: readonly BottlePart[];
  readonly glints: readonly string[];
}

const STAND_PARTS: BottlePart[] = [
  solid(slab(STAND.base, 0, STAND.height, 0.5)),
  stroke(
    line(
      [
        [STAND.base.x + 9, STAND.base.y + STAND.base.d, 0.7],
        [STAND.base.x + STAND.base.w - 9, STAND.base.y + STAND.base.d, 0.7],
        [STAND.base.x + STAND.base.w - 9, STAND.base.y + STAND.base.d, 1.8],
        [STAND.base.x + 9, STAND.base.y + STAND.base.d, 1.8],
      ],
      true,
    ),
    'mid',
  ),
  ...STAND.cradles.map((a) => solid(prism(wedge(-1, a), [STAND.thickness, 0, 0], 0.3))),
];
const CRADLE_PARTS: BottlePart[] = STAND.cradles.map((a) =>
  solid(prism(wedge(1, a), [STAND.thickness, 0, 0], 0.3)),
);

function ring(center: Vec3, a: number, radius: number, steps = 28): Vec3[] {
  return circle(0, 0, radius, 0, steps).map(([p, q]): Vec3 => vec.add(center, [a, p, q]));
}

const GLINT = vec.normalize([0, LIGHT[1] + SCREEN.out[1], LIGHT[2] + SCREEN.out[2]]);

export function bottleDrawingAt({ y, z, spin, sinceImpact }: BottlePose): BottleDrawing {
  const center: Vec3 = [BOTTLE.x, y, z];
  const cos = Math.cos(spin);
  const sin = Math.sin(spin);
  const toWorld = ([a, p, q]: Vec3): Vec3 => [
    center[0] + a,
    center[1] + p * cos - q * sin,
    center[2] + p * sin + q * cos,
  ];

  const glass = pathOf(
    hull(PROFILE.flatMap(([a, radius]) => ring(center, a, radius)).map(project)),
    true,
  );

  let shadow: BottleDrawing['shadow'];
  if (y > DESK_EDGE.front - 1) {
    const floor = DESK_EDGE.floor + 0.1;
    shadow = {
      d: line(
        [
          [BOTTLE.x - 18, y - R * 0.8, floor],
          [BOTTLE.x + 22, y - R * 0.5, floor],
          [BOTTLE.x + 22, y + R * 0.5, floor],
          [BOTTLE.x - 18, y + R * 0.8, floor],
        ],
        true,
      ),
      opacity: 0.32 * clamp(1 - (z - FLOOR_REST) / 70),
    };
  }

  const cracks = { far: '', near: '' };
  const shards: string[] = [];
  if (sinceImpact !== undefined) {
    const landedSpin = -(LANDING_Y - BOTTLE.y) / R;
    const localAngle = (y: number, z: number) =>
      Math.atan2(
        z * Math.cos(landedSpin) - y * Math.sin(landedSpin),
        y * Math.cos(landedSpin) + z * Math.sin(landedSpin),
      );
    const spread = smooth(clamp(sinceImpact / CRACK_MS));
    const far: string[] = [];
    const near: string[] = [];
    for (const star of STARS) {
      const from =
        (star.facing === 'floor' ? localAngle(0, -1) : localAngle(SCREEN.out[1], SCREEN.out[2])) +
        star.turn;
      const onGlass = (a: number, s: number): Vec3 => {
        const angle = from + s / R;
        return toWorld([star.a + a, (R + 0.02) * Math.cos(angle), (R + 0.02) * Math.sin(angle)]);
      };
      for (const crack of star.cracks) {
        const shown = crack.slice(0, Math.max(1, Math.ceil(crack.length * spread)));
        for (let i = 1; i < shown.length; i++) {
          const [a0, s0] = shown[i - 1] ?? [0, 0];
          const [a1, s1] = shown[i] ?? [0, 0];
          if (star.a + a1 < PROFILE[1][0] || star.a + a1 > PROFILE[2][0]) break;
          const angle = from + (s0 + s1) / 2 / R;
          const normal = vec.sub(toWorld([0, Math.cos(angle), Math.sin(angle)]), center);
          (vec.dot(normal, SCREEN.out) > 0 ? near : far).push(
            line([onGlass(a0, s0), onGlass(a1, s1)]),
          );
        }
      }
    }
    cracks.far = far.join('');
    cracks.near = near.join('');

    const scatter = 1 - Math.exp(-sinceImpact / 110);
    const origin: Vec3 = [BOTTLE.x + (STARS[0]?.a ?? 0), LANDING_Y, DESK_EDGE.floor + 0.15];
    for (const shard of SHARDS) {
      const middle = vec.add(origin, [
        Math.cos(shard.heading) * shard.distance * scatter * 1.6,
        Math.sin(shard.heading) * shard.distance * scatter,
        0,
      ]);
      const turn = shard.spin * scatter;
      shards.push(
        line(
          shard.corners.map(
            (corner): Vec3 =>
              vec.add(middle, [
                Math.cos(corner + turn) * shard.size,
                Math.sin(corner + turn) * shard.size * 0.7,
                0,
              ]),
          ),
          true,
        ),
      );
    }
  }

  const radiusAt = (a: number) => {
    for (let i = 1; i < PROFILE.length; i++) {
      const [a0, r0] = PROFILE[i - 1] ?? PROFILE[0];
      const [a1, r1] = PROFILE[i] ?? PROFILE[0];
      if (a <= a1) return r0 + ((r1 - r0) * (a - a0)) / (a1 - a0);
    }
    return R;
  };
  const glintAt = (a: number, offset: number, inset: number): Vec3 => {
    const angle = Math.atan2(GLINT[2], GLINT[1]) + offset;
    const radius = radiusAt(a) * inset;
    return vec.add(center, [a, radius * Math.cos(angle), radius * Math.sin(angle)]);
  };
  const sweep = (from: number, to: number, offset: number, inset: number) =>
    line(Array.from({ length: 9 }, (_, i) => glintAt(from + ((to - from) * i) / 8, offset, inset)));

  return {
    shadow,
    shards,
    stand: STAND_PARTS,
    cradle: CRADLE_PARTS,
    cradleInFront: y <= BOTTLE.y + 1 && z <= BOTTLE.rest + 0.5,
    glass,
    cracks,
    inside: [
      ...shipParts(toWorld),
      solid(rod(vec.add(center, [CORK.from, 0, 0]), [CORK.length, 0, 0], CORK.radius), 'lo'),
    ],
    rims: [
      stroke(line(ring(center, -18.3, R), true), 'lo'),
      stroke(line(ring(center, -17.9, 2.6), true), 'faint'),
      stroke(line(ring(center, 9, R), true), 'faint'),
      stroke(line(ring(center, 14, 2.7), true), 'faint'),
      stroke(line(ring(center, 19.6, 2.85), true), 'lo'),
    ],
    glints: [sweep(-16.5, 6.5, 0, 0.9), sweep(-14, -7, -0.45, 0.93), sweep(9.6, 12.6, 0, 0.9)],
  };
}

export const BOTTLE_AREA = areaOf(
  [
    ...PROFILE.flatMap(([a, radius]) => ring([BOTTLE.x, BOTTLE.y, BOTTLE.rest], a, radius)),
    ...[0, STAND.height].flatMap((z) => [
      [STAND.base.x, STAND.base.y, z] satisfies Vec3,
      [STAND.base.x + STAND.base.w, STAND.base.y, z] satisfies Vec3,
      [STAND.base.x, STAND.base.y + STAND.base.d, z] satisfies Vec3,
      [STAND.base.x + STAND.base.w, STAND.base.y + STAND.base.d, z] satisfies Vec3,
    ]),
  ].map(project),
);
