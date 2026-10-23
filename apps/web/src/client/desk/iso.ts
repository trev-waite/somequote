/**
 * Convex isometric solids with z up and the viewer looking down from +x, +y.
 * Visual style inspired by github.com/wheresryan22/anatomy (MIT).
 */
export type Vec3 = readonly [x: number, y: number, z: number];

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Plan {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly d: number;
  readonly r: number;
}

export interface SolidPaths {
  readonly fill: string;
  readonly outline: string;
  readonly crease: string;
  readonly bevel: string;
  readonly top: string;
  readonly shades: readonly string[];
}

const RADIANS = Math.PI / 180;
const AZIMUTH = 52 * RADIANS;
const ELEVATION = 30 * RADIANS;
const SIN_A = Math.sin(AZIMUTH);
const COS_A = Math.cos(AZIMUTH);
const SIN_E = Math.sin(ELEVATION);
const COS_E = Math.cos(ELEVATION);
const SHADES = 4;
const TOWARD_VIEWER: Vec3 = [COS_A * COS_E, SIN_A * COS_E, SIN_E];

export const SCREEN = {
  right: [SIN_A, -COS_A, 0] satisfies Vec3,
  down: [COS_A * SIN_E, SIN_A * SIN_E, -COS_E] satisfies Vec3,
  out: TOWARD_VIEWER,
} as const;

export const LIGHT = normalize([-SIN_A, COS_A, 0.35]);

export function project([x, y, z]: Vec3): Point {
  return { x: x * SIN_A - y * COS_A, y: (x * COS_A + y * SIN_A) * SIN_E - z * COS_E };
}

export function depthOf([x, y, z]: Vec3): number {
  return (x * COS_A + y * SIN_A) * COS_E + z * SIN_E;
}

function normalize([x, y, z]: Vec3): Vec3 {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, by: number): Vec3 => [a[0] * by, a[1] * by, a[2] * by];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export const round = (value: number) => Math.round(value * 100) / 100;

export function pathOf(points: readonly Point[], closed = false): string {
  if (points.length === 0) return '';
  const d = points
    .map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'}${round(x)} ${round(y)}`)
    .join('');
  return closed ? `${d}Z` : d;
}

export const line = (points: readonly Vec3[], closed = false) =>
  pathOf(points.map(project), closed);

export function hull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const turn = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: readonly Point[]) => {
    const chain: Point[] = [];
    for (const point of list) {
      while (chain.length >= 2) {
        const a = chain.at(-2);
        const b = chain.at(-1);
        if (!a || !b || turn(a, b, point) > 0) break;
        chain.pop();
      }
      chain.push(point);
    }
    chain.pop();
    return chain;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

export function areaOf(points: readonly Point[]) {
  const outline = hull(points);
  const xs = outline.map(({ x }) => x);
  const ys = outline.map(({ y }) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const width = Math.max(...xs) - x;
  const height = Math.max(...ys) - y;
  return {
    box: { x, y, width, height },
    clipPath: `polygon(${outline.map((p) => `${(((p.x - x) / width) * 100).toFixed(2)}% ${(((p.y - y) / height) * 100).toFixed(2)}%`).join(',')})`,
  };
}

function runsOf(flags: readonly boolean[], want: boolean): number[][] {
  const count = flags.length;
  const start = flags.findIndex((flag, index) => flag !== flags[(index + count - 1) % count]);
  if (start < 0) return flags[0] === want ? [[...flags.keys(), 0]] : [];
  const runs: number[][] = [];
  let run: number[] | null = null;
  for (let step = 0; step < count; step++) {
    const index = (start + step) % count;
    if (flags[index] === want) {
      run ??= [index];
      run.push((index + 1) % count);
    } else if (run) {
      runs.push(run);
      run = null;
    }
  }
  if (run) runs.push(run);
  return runs;
}

export function prism(ring: readonly Vec3[], along: Vec3, bevel = 0): SolidPaths {
  const count = ring.length;
  const center = scale(
    ring.reduce<Vec3>((sum, point) => add(sum, point), [0, 0, 0]),
    1 / count,
  );
  const far = ring.map((point) => add(point, along));
  const axis = normalize(along);
  const capNear = dot(axis, TOWARD_VIEWER) >= 0;
  const cap = capNear ? far : ring;
  const normals = ring.map((point, index) => {
    const next = ring[(index + 1) % count] ?? point;
    const normal = normalize(cross(sub(next, point), axis));
    const outward = dot(normal, sub(point, center)) >= 0;
    return outward ? normal : scale(normal, -1);
  });
  const facing = normals.map((normal) => dot(normal, TOWARD_VIEWER) > 1e-9);
  const capFlat = cap.map(project);
  const baseFlat = (capNear ? ring : far).map(project);
  const at = (list: readonly Point[], index: number) => list[index] ?? { x: 0, y: 0 };

  const buckets: string[][] = Array.from({ length: SHADES }, () => []);
  normals.forEach((normal, index) => {
    if (!facing[index]) return;
    const lit = (dot(normal, LIGHT) + 1) / 2;
    const shade = Math.min(SHADES - 1, Math.max(0, Math.floor(lit * SHADES)));
    const next = (index + 1) % count;
    buckets[shade]?.push(
      pathOf(
        [at(capFlat, index), at(capFlat, next), at(baseFlat, next), at(baseFlat, index)],
        true,
      ),
    );
  });

  const crease = runsOf(facing, true)
    .map((run) => pathOf(run.map((index) => at(capFlat, index))))
    .join('');

  let bevelPath = '';
  if (bevel > 0) {
    const inset = cap.map((point, index) => {
      const a = normals[(index + count - 1) % count] ?? axis;
      const b = normals[index] ?? axis;
      const mid = normalize(add(a, b));
      return project(sub(point, scale(mid, bevel)));
    });
    bevelPath = runsOf(facing, true)
      .map((run) => {
        const first = run[0] ?? 0;
        const last = run.at(-1) ?? 0;
        return pathOf([
          at(capFlat, first),
          ...run.slice(1, -1).map((index) => at(inset, index)),
          at(capFlat, last),
        ]);
      })
      .join('');
  }

  const silhouette = hull([...capFlat, ...baseFlat]);
  return {
    fill: pathOf(silhouette, true),
    outline: pathOf(silhouette, true),
    crease,
    bevel: bevelPath,
    top: pathOf(capFlat, true),
    shades: buckets.map((paths) => paths.join('')),
  };
}

export function roundedPlan({ x, y, w, d, r }: Plan, z: number, steps = 6): Vec3[] {
  const radius = Math.max(0, Math.min(r, w / 2, d / 2));
  const corners = [
    [x + w - radius, y + radius, -90],
    [x + w - radius, y + d - radius, 0],
    [x + radius, y + d - radius, 90],
    [x + radius, y + radius, 180],
  ] as const;
  return corners.flatMap(([cx, cy, start]) =>
    Array.from({ length: steps + 1 }, (_, step): Vec3 => {
      const angle = (start + (90 * step) / steps) * RADIANS;
      return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), z];
    }),
  );
}

export const slab = (plan: Plan, z: number, height: number, bevel = 0) =>
  prism(roundedPlan(plan, z), [0, 0, height], bevel);

export function circle(cx: number, cy: number, radius: number, z: number, steps = 32): Vec3[] {
  return Array.from({ length: steps }, (_, step): Vec3 => {
    const angle = (step / steps) * Math.PI * 2;
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), z];
  });
}

export const cylinder = (
  cx: number,
  cy: number,
  radius: number,
  z: number,
  height: number,
  bevel = 0,
) => prism(circle(cx, cy, radius, z), [0, 0, height], bevel);

export const insetPlan = ({ x, y, w, d, r }: Plan, by: number): Plan => ({
  x: x + by,
  y: y + by,
  w: w - by * 2,
  d: d - by * 2,
  r: Math.max(0, r - by),
});

export function corners({ x, y, w, d }: Plan, inset: number): [number, number][] {
  return [
    [x + inset, y + inset],
    [x + w - inset, y + inset],
    [x + inset, y + d - inset],
    [x + w - inset, y + d - inset],
  ];
}

export function sideArc(cx: number, cy: number, radius: number, z: number, steps = 20): string {
  const facing = Math.atan2(TOWARD_VIEWER[1], TOWARD_VIEWER[0]);
  return line(
    Array.from({ length: steps + 1 }, (_, step): Vec3 => {
      const angle = facing - Math.PI / 2 + (step / steps) * Math.PI;
      return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), z];
    }),
  );
}

export function knurl(
  cx: number,
  cy: number,
  radius: number,
  z0: number,
  z1: number,
  count: number,
) {
  const lines: string[] = [];
  for (let index = 0; index < count; index++) {
    const angle = (index / count) * Math.PI * 2;
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);
    if (nx * TOWARD_VIEWER[0] + ny * TOWARD_VIEWER[1] < 0.25) continue;
    lines.push(
      line([
        [cx + radius * nx, cy + radius * ny, z0 + 0.4],
        [cx + radius * nx, cy + radius * ny, z1 - 0.4],
      ]),
    );
  }
  return lines.join('');
}

export function uprightRect(
  x0: number,
  y: number,
  z0: number,
  w: number,
  h: number,
  r: number,
): Vec3[] {
  return roundedPlan({ x: x0, y: z0, w, d: h, r }, 0).map(([x, z]): Vec3 => [x, y, z]);
}

export function rod(base: Vec3, along: Vec3, radius: number, steps = 20): SolidPaths {
  const axis = normalize(along);
  const helper: Vec3 = Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = normalize(cross(axis, helper));
  const v = cross(axis, u);
  const ring = Array.from({ length: steps }, (_, step): Vec3 => {
    const angle = (step / steps) * Math.PI * 2;
    return add(base, add(scale(u, radius * Math.cos(angle)), scale(v, radius * Math.sin(angle))));
  });
  return prism(ring, along);
}

export function planeMatrix(origin: Vec3, u: Vec3, v: Vec3): string {
  const o = project(origin);
  const pu = project(u);
  const pv = project(v);
  const f = (value: number) => Math.round(value * 1000) / 1000;
  return `matrix(${f(pu.x)} ${f(pu.y)} ${f(pv.x)} ${f(pv.y)} ${f(o.x)} ${f(o.y)})`;
}

export const vec = { add, sub, scale, dot, cross, normalize } as const;
