import { lampLightOn, type Part, paperShade } from './desk-geometry';
import {
  depthOf,
  line,
  planeMatrix,
  prism,
  project,
  roundedPlan,
  SCREEN,
  slab,
  type Vec3,
  vec,
} from './iso';

export const BOOK = {
  spine: -16,
  y: 11,
  depth: 32,
  width: 27,
  cover: 1.2,
  paper: 4,
  rise: 3,
  leaves: 12,
  turnMs: 650,
  title: 'How to Build a Car',
} as const;

export const BOOK_MIDDLE = BOOK.leaves / 2;
export const FRONT_COVER = -1;
export const BACK_COVER = BOOK.leaves + 1;
export type BookDirection = 'previous' | 'next';
type BookPart = Extract<Part, { kind: 'solid' | 'line' | 'writing' | 'lit' }>;
type Side = -1 | 1;
type Surface = (across: number, along: number) => Vec3;

const clamp = (t: number) => Math.max(0, Math.min(1, t));
const smooth = (t: number) => t * t * (3 - 2 * t);
const countAt = (position: number) => Math.max(0, Math.min(BOOK.leaves, position));
const solid = (paths: ReturnType<typeof prism>, tone: 'mid' | 'lo' = 'mid'): BookPart => ({
  kind: 'solid',
  paths,
  tone,
});
const stroke = (d: string, tone: 'lo' | 'faint' = 'lo'): BookPart => ({ kind: 'line', d, tone });
const samples = Array.from({ length: 13 }, (_, i) => i / 12);

/**
 * A flat face of the book lit by the lamp, the same way wherever it is: lying in the book, turning
 * over, or landing. Paper is shaded too; a cover keeps its own colour and only takes the light.
 */
function lit(
  points: readonly Vec3[],
  paper: boolean,
): Extract<BookPart, { kind: 'lit' }> & { readonly depth: number } {
  const [a = [0, 0, 0], b = a] = points;
  const c = points.at(-1) ?? a;
  const normal = vec.normalize(vec.cross(vec.sub(b, a), vec.sub(c, a)));
  const facing = vec.dot(normal, SCREEN.out) < 0 ? vec.scale(normal, -1) : normal;
  const middle = vec.scale(
    points.reduce<Vec3>((sum, point) => vec.add(sum, point), [0, 0, 0]),
    1 / points.length,
  );
  return {
    kind: 'lit',
    d: line(points, true),
    light: lampLightOn(middle, facing),
    ...(paper ? { shade: paperShade(middle, facing) } : {}),
    depth: depthOf(middle),
  };
}

/**
 * A sheet of paper as panels, nearest last, each shaded for the way it faces, then the lamp's light
 * over the whole sheet at once: overlaid panel by panel, the light would show their seams.
 */
function litPaper(surface: Surface, rows: number): BookPart[] {
  const panels = samples
    .slice(0, -1)
    .flatMap((across, column) =>
      Array.from({ length: rows }, (_, row) => {
        const next = samples[column + 1] ?? 1;
        return lit(
          [
            surface(across, row / rows),
            surface(next, row / rows),
            surface(next, (row + 1) / rows),
            surface(across, (row + 1) / rows),
          ],
          true,
        );
      }),
    )
    .sort((a, b) => a.depth - b.depth);
  const light = panels.reduce((sum, panel) => sum + panel.light, 0) / panels.length;
  const outline = [
    ...samples.map((t) => surface(t, 0)),
    ...[...samples].reverse().map((t) => surface(t, 1)),
  ];
  return [
    ...panels.map(({ d, shade = 0 }): BookPart => ({ kind: 'lit', d, light: 0, shade })),
    { kind: 'lit', d: line(outline, true), light },
  ];
}

export function nextBookPosition(position: number, direction: BookDirection): number {
  return Math.max(FRONT_COVER, Math.min(BACK_COVER, position + (direction === 'next' ? 1 : -1)));
}

function pageHeight(across: number, count: number, openness: number): number {
  const outer = BOOK.cover + (count * BOOK.paper) / BOOK.leaves;
  const gutter = BOOK.cover + BOOK.paper / 2 + BOOK.rise;
  return outer + (gutter - outer) * Math.cos((across * Math.PI) / 2) * openness;
}

const pageSurface =
  (side: Side, count: number, openness: number): Surface =>
  (across, along) => [
    BOOK.spine + side * across * BOOK.width,
    BOOK.y + along * BOOK.depth,
    pageHeight(across, count, openness),
  ];

function writing(surface: Surface, page: number): string {
  return Array.from({ length: 8 }, (_, row) => {
    const end = (row + page) % 5 === 0 ? 0.58 : 0.86;
    return line(
      samples
        .filter((t) => t >= 0.1 && t <= end)
        .map((t) => vec.add(surface(t, (4.5 + row * 3.2) / BOOK.depth), [0, 0, 0.04])),
    );
  }).join('');
}

function pageBlock(side: Side, count: number, openness: number, page: number): BookPart[] {
  if (count <= 0) return [];
  const surface = pageSurface(side, count, openness);
  const profile: Vec3[] = [
    [BOOK.spine + side * BOOK.width, BOOK.y, BOOK.cover],
    ...[...samples].reverse().map((t) => surface(t, 0)),
    [BOOK.spine, BOOK.y, BOOK.cover],
  ];
  const block = prism(side === 1 ? profile.reverse() : profile, [0, BOOK.depth, 0]);
  // The page edges are drawn on the block's outer side, which only the right block turns toward
  // the reader; drawn on the left block they would show through its pages.
  const outerFacesReader = vec.dot([side, 0, 0], SCREEN.out) > 0;
  const edges = Array.from(
    { length: outerFacesReader ? Math.max(0, Math.ceil(count) - 1) : 0 },
    (_, i) => {
      const z = BOOK.cover + ((i + 1) * BOOK.paper) / BOOK.leaves;
      return line([
        [BOOK.spine + side * BOOK.width, BOOK.y, z],
        [BOOK.spine + side * BOOK.width, BOOK.y + BOOK.depth, z],
      ]);
    },
  ).join('');
  return [
    solid(block),
    ...litPaper(surface, 1),
    ...(edges ? [stroke(edges, 'faint')] : []),
    stroke(writing(surface, page)),
  ];
}

const coverPlan = (side: Side) => ({
  x: side === -1 ? BOOK.spine - BOOK.width - 1.5 : BOOK.spine,
  y: BOOK.y - 1.5,
  w: BOOK.width + 1.5,
  d: BOOK.depth + 3,
  r: 0.8,
});

function coverTitle(origin: Vec3, u: Vec3): BookPart[] {
  return ['How to', 'Build a Car'].map((text, i) => ({
    kind: 'writing',
    text,
    transform: planeMatrix(origin, u, [0, 1, 0]),
    x: (BOOK.width + 1.5) / 2,
    y: 13 + i * 6.3,
    size: 5.2,
  }));
}

function coverTurn(side: Side, progress: number): BookPart[] {
  const angle = progress * Math.PI;
  const u: Vec3 = [side * Math.cos(angle), 0, Math.sin(angle)];
  const normal: Vec3 = [-side * Math.sin(angle), 0, Math.cos(angle)];
  const center: Vec3 = [
    BOOK.spine,
    BOOK.y - 1.5,
    BOOK.cover / 2 + (BOOK.cover + BOOK.paper) * smooth(progress),
  ];
  const exterior = vec.sub(center, vec.scale(normal, BOOK.cover / 2));
  const ring = roundedPlan({ x: 0, y: 0, w: BOOK.width + 1.5, d: BOOK.depth + 3, r: 0.8 }, 0).map(
    ([x, y]) => vec.add(exterior, vec.add(vec.scale(u, x), [0, y, 0])),
  );
  const thickness = vec.scale(normal, BOOK.cover);
  const { depth: _, ...face } = lit(
    vec.dot(normal, SCREEN.out) < 0 ? ring : ring.map((point) => vec.add(point, thickness)),
    false,
  );
  const parts: BookPart[] = [solid(prism(ring, thickness)), face];
  if (vec.dot(normal, SCREEN.out) < 0) {
    const origin = side === -1 ? exterior : vec.add(exterior, vec.scale(u, BOOK.width + 1.5));
    parts.push(...coverTitle(origin, side === -1 ? u : vec.scale(u, -1)));
  }
  return parts;
}

function hitArea(surface: Surface, cover = false) {
  const outline = cover
    ? [surface(0, 0), surface(1, 0), surface(1, 1), surface(0, 1)]
    : [...samples.map((t) => surface(t, 0)), ...[...samples].reverse().map((t) => surface(t, 1))];
  const flat = outline.map(project);
  const x = Math.min(...flat.map((p) => p.x));
  const y = Math.min(...flat.map((p) => p.y));
  const width = Math.max(...flat.map((p) => p.x)) - x;
  const height = Math.max(...flat.map((p) => p.y)) - y;
  return {
    box: { x, y, width, height },
    clipPath: `polygon(${flat.map((p) => `${((p.x - x) / width) * 100}% ${((p.y - y) / height) * 100}%`).join(',')})`,
  };
}

export interface TurningSheet {
  readonly panels: readonly BookPart[];
  readonly outline: string;
  readonly writing: string;
}

function turningSheet(
  side: Side,
  fromCount: number,
  toCount: number,
  progress: number,
  page: number,
): TurningSheet {
  const gutter = BOOK.cover + BOOK.paper / 2 + BOOK.rise;
  const surface: Surface = (across, along) => {
    const angle =
      progress * Math.PI +
      Math.sin(progress * Math.PI) * 0.16 * Math.sin(across * Math.PI) * Math.sin(along * Math.PI);
    const base =
      pageHeight(across, fromCount, 1) * (1 - progress) + pageHeight(across, toCount, 1) * progress;
    return [
      BOOK.spine + side * across * BOOK.width * Math.cos(angle),
      BOOK.y + along * BOOK.depth,
      gutter + (base - gutter) * Math.cos(angle) ** 2 + across * BOOK.width * Math.sin(angle),
    ];
  };
  const panels = litPaper(surface, 4);
  const outline = [
    ...samples.map((t) => surface(t, 0)),
    surface(1, 1),
    ...[...samples].reverse().map((t) => surface(t, 1)),
  ];
  return { panels, outline: line(outline, true), writing: writing(surface, page) };
}

/** A leaf leaves its source stack before landing on the other; the total amount of paper is fixed. */
export function bookDrawingAt(position: number, target = position, progress = 0): BookDrawing {
  const p = smooth(clamp(progress));
  if (target !== position && p >= 1) return bookDrawingAt(target);
  const moving = target !== position;
  const coverSide: Side | undefined =
    Math.min(position, target) < 0 ? -1 : Math.max(position, target) > BOOK.leaves ? 1 : undefined;
  const closed = !moving && (position === FRONT_COVER || position === BACK_COVER);
  const closing = coverSide === -1 ? target === FRONT_COVER : target === BACK_COVER;
  const coverProgress = moving ? (closing ? p : 1 - p) : closed ? 1 : 0;
  const openness = coverSide ? 1 - coverProgress : 1;
  const direction = target > position ? 1 : -1;
  let left = countAt(position);
  let right = BOOK.leaves - left;
  let airborne = 0;
  if (moving && !coverSide) {
    const lifted = smooth(clamp(p / 0.3));
    const landed = smooth(clamp((p - 0.7) / 0.3));
    left += direction === 1 ? landed : -lifted;
    right += direction === 1 ? -lifted : landed;
    airborne = lifted - landed;
  }
  const parts: BookPart[] = [];
  for (const side of [-1, 1] as const) {
    if (coverSide === side && (moving || closed)) continue;
    const board = slab(coverPlan(side), 0, BOOK.cover);
    parts.push(solid(board), { kind: 'lit', d: board.top, light: 1 });
  }
  const leftPage = Math.max(
    2,
    countAt(position) * 2 - (moving && direction === -1 && !coverSide ? 2 : 0),
  );
  const rightPage = Math.min(
    BOOK.leaves * 2 - 1,
    countAt(position) * 2 + 1 + (moving && direction === 1 && !coverSide ? 2 : 0),
  );
  parts.push(
    ...pageBlock(-1, left, openness, leftPage),
    ...pageBlock(1, right, openness, rightPage),
  );
  parts.push(
    stroke(
      line([
        [BOOK.spine, BOOK.y + BOOK.depth, BOOK.cover + BOOK.paper / 2 + 0.8],
        [BOOK.spine + 0.6, BOOK.y + BOOK.depth + 1.5, BOOK.cover],
        [BOOK.spine + 2.4, BOOK.y + BOOK.depth + 8, 0.1],
      ]),
    ),
  );
  let sheet: TurningSheet | undefined;
  let cover: BookPart[] = [];
  if (coverSide && (moving || closed)) {
    cover = coverTurn(coverSide, coverProgress);
  } else if (moving) {
    const side = direction === 1 ? 1 : -1;
    const source = side === 1 ? BOOK.leaves - countAt(position) : countAt(position);
    const destination = side === 1 ? countAt(position) + 1 : BOOK.leaves - countAt(position) + 1;
    const page =
      direction === 1
        ? countAt(position) * 2 + (p < 0.5 ? 1 : 2)
        : countAt(position) * 2 - (p < 0.5 ? 0 : 1);
    sheet = turningSheet(side, source, destination, p, page);
  }
  const area = (side: Side) => {
    const count = side === -1 ? left : right;
    if ((closed && side !== coverSide) || count === 0) {
      const z = closed ? BOOK.cover * 2 + BOOK.paper : BOOK.cover;
      return hitArea(
        (across, along) => [
          BOOK.spine + side * across * (BOOK.width + 1.5),
          BOOK.y - 1.5 + along * (BOOK.depth + 3),
          z,
        ],
        true,
      );
    }
    return hitArea(pageSurface(side, count, openness));
  };
  return {
    parts,
    cover,
    sheet,
    left,
    right,
    airborne,
    leftHeight: (left * BOOK.paper) / BOOK.leaves,
    rightHeight: (right * BOOK.paper) / BOOK.leaves,
    previous: area(-1),
    next: area(1),
  };
}

export interface BookDrawing {
  readonly parts: readonly BookPart[];
  readonly cover: readonly BookPart[];
  readonly sheet: TurningSheet | undefined;
  readonly left: number;
  readonly right: number;
  readonly airborne: number;
  readonly leftHeight: number;
  readonly rightHeight: number;
  readonly previous: ReturnType<typeof hitArea>;
  readonly next: ReturnType<typeof hitArea>;
}
