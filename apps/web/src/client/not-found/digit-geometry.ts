import {
  depthOf,
  LIGHT,
  line,
  type Point,
  project,
  SCREEN,
  slab,
  type Vec3,
  vec,
} from '../desk/iso';

type Contour = readonly Point[];

interface Glyph {
  readonly contours: readonly Contour[];
  readonly radius: readonly number[];
}

export const DEPTH = 18;
export const HEIGHT = 80;
export const WIDTH = 200;
const SHADES = 4;

const rect = (x: number, y: number, w: number, h: number): Contour => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

const ZERO: Glyph = { contours: [rect(0, 0, 56, HEIGHT), rect(17, 17, 22, 46)], radius: [20, 8] };
const FOUR: Glyph = {
  contours: [
    [
      { x: 31, y: 0 },
      { x: 48, y: 0 },
      { x: 48, y: 18 },
      { x: 58, y: 18 },
      { x: 58, y: 35 },
      { x: 48, y: 35 },
      { x: 48, y: HEIGHT },
      { x: 31, y: HEIGHT },
      { x: 0, y: 35 },
      { x: 0, y: 18 },
      { x: 31, y: 18 },
    ],
    [
      { x: 15.8, y: 35 },
      { x: 31, y: 35 },
      { x: 31, y: 57.1 },
    ],
  ],
  radius: [2.5, 2],
};

const at = (contour: Contour, index: number) =>
  contour[(index + contour.length) % contour.length] ?? { x: 0, y: 0 };
const unit = ({ x, y }: Point): Point => {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
};

function fillet(contour: Contour, radius: number): Contour {
  return contour.flatMap((corner, index) => {
    const before = at(contour, index - 1);
    const after = at(contour, index + 1);
    const u = unit({ x: before.x - corner.x, y: before.y - corner.y });
    const v = unit({ x: after.x - corner.x, y: after.y - corner.y });
    const half = Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y))) / 2;
    const reach = Math.min(
      radius / Math.tan(half),
      Math.hypot(before.x - corner.x, before.y - corner.y) / 2,
      Math.hypot(after.x - corner.x, after.y - corner.y) / 2,
    );
    const r = reach * Math.tan(half);
    const bisector = unit({ x: u.x + v.x, y: u.y + v.y });
    const center = {
      x: corner.x + (bisector.x * r) / Math.sin(half),
      y: corner.y + (bisector.y * r) / Math.sin(half),
    };
    const start = { x: corner.x + u.x * reach - center.x, y: corner.y + u.y * reach - center.y };
    const end = { x: corner.x + v.x * reach - center.x, y: corner.y + v.y * reach - center.y };
    const steps = Math.max(1, Math.ceil(((Math.PI - 2 * half) * r) / 3));
    return Array.from({ length: steps + 1 }, (_, step) => {
      const t = step / steps;
      const toward = unit({
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
      });
      return { x: center.x + toward.x * r, y: center.y + toward.y * r };
    });
  });
}

const signedArea = (contour: Contour) =>
  contour.reduce((sum, p, index) => {
    const q = at(contour, index + 1);
    return sum + p.x * q.y - q.x * p.y;
  }, 0);

interface DigitDrawing {
  readonly walls: readonly { readonly d: string; readonly shade: number; readonly edges: string }[];
  readonly face: string;
  readonly crease: string;
  readonly outline: string;
}

/** Extrudes a glyph standing upright, its face toward the reader, with walls painted far to near. */
function digit({ contours, radius }: Glyph, left: number): DigitDrawing {
  const rings = contours.map((contour, index) => {
    const round = fillet(contour, radius[index] ?? 0);
    const outer = index === 0;
    return outer === signedArea(round) > 0 ? round : [...round].reverse();
  });
  const point = ({ x, y }: Point, depth: number): Vec3 => [left + x, depth, y];
  const walls: (DigitDrawing['walls'][number] & { depth: number })[] = [];
  const crease: string[] = [];
  const outline: string[] = [];

  for (const ring of rings) {
    const normals = ring.map((p, index) => {
      const q = at(ring, index + 1);
      return vec.normalize([q.y - p.y, 0, p.x - q.x]);
    });
    const facing = normals.map((normal) => vec.dot(normal, SCREEN.out) > 1e-9);
    ring.forEach((p, index) => {
      const q = at(ring, index + 1);
      const front = [point(p, DEPTH), point(q, DEPTH)];
      if (!facing[index]) {
        outline.push(line(front));
        return;
      }
      crease.push(line(front));
      const back = [point(p, 0), point(q, 0)] as const;
      const edges = [line([...back])];
      if (!facing.at(index - 1)) edges.push(line([front[0] as Vec3, back[0]]));
      if (!facing[(index + 1) % ring.length]) edges.push(line([front[1] as Vec3, back[1]]));
      const lit = (vec.dot(normals[index] as Vec3, LIGHT) + 1) / 2;
      walls.push({
        d: line([...front, back[1], back[0]], true),
        shade: Math.min(SHADES - 1, Math.floor(lit * SHADES)),
        edges: edges.join(''),
        depth: depthOf(point({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, DEPTH / 2)),
      });
    });
  }

  return {
    walls: walls.sort((a, b) => a.depth - b.depth).map(({ depth: _, ...wall }) => wall),
    face: rings
      .map((ring) =>
        line(
          ring.map((p) => point(p, DEPTH)),
          true,
        ),
      )
      .join(''),
    crease: crease.join(''),
    outline: outline.join(''),
  };
}

const PLACED = [
  { glyph: FOUR, left: 0 },
  { glyph: ZERO, left: 72 },
  { glyph: FOUR, left: 142 },
] as const;

export const DIGITS = PLACED.map(({ glyph, left }) => digit(glyph, left));

/** The middle of each digit's face, where the spyglass looks. */
export const DIGIT_TARGETS = PLACED.map(({ glyph, left }): Vec3 => {
  const width = Math.max(...(glyph.contours[0] ?? []).map(({ x }) => x));
  return [left + width / 2, DEPTH, HEIGHT / 2];
});

export const ZERO_TOP: Vec3 = [100, DEPTH / 2, HEIGHT];

export const DIGIT_CORNERS = [0, DEPTH].flatMap((depth) =>
  [0, WIDTH].flatMap((x) => [0, HEIGHT].map((z) => project([x, depth, z]))),
);

export const DIGIT_HALO = slab({ x: -4, y: -5, w: WIDTH + 8, d: DEPTH + 10, r: 8 }, -4, 2).fill;
