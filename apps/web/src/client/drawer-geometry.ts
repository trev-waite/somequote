import { APRON_FRONT, CENTER_DRAWER, DRAWER_FACE, type Part } from './desk-geometry';
import {
  areaOf,
  line,
  pathOf,
  planeMatrix,
  prism,
  project,
  rod,
  slab,
  uprightRect,
  type Vec3,
  vec,
} from './iso';

export const DRAWER = {
  /** How far the drawer slides out of the apron, in world units. */
  travel: 30,
  depth: 40,
  panel: 1.5,
  /** The box sits this far inside the opening on every side, leaving a dark gap round it. */
  gap: 0.6,
  wall: 1.1,
  floor: 0.8,
  openMs: 560,
  closeMs: 440,
  /**
   * The letter lies `back` from the inside of the drawer front, far enough that the front does not
   * hide it from a reader looking down at the open drawer.
   */
  letter: {
    text: 'Made by Trevor',
    width: 44,
    depth: 15,
    back: 11,
    size: 6.2,
    turn: (-3 * Math.PI) / 180,
  },
} as const;

type DrawerPart = Extract<Part, { kind: 'solid' | 'line' | 'writing' }>;

const X0 = CENTER_DRAWER.x;
const X1 = CENTER_DRAWER.x + CENTER_DRAWER.w;
const Z0 = DRAWER_FACE.z;
const Z1 = DRAWER_FACE.z + DRAWER_FACE.h;
const FLOOR_TOP = Z0 + DRAWER.gap + DRAWER.floor;

const solid = (paths: ReturnType<typeof prism>, tone: 'mid' | 'lo' = 'mid'): DrawerPart => ({
  kind: 'solid',
  paths,
  tone,
});

/** Keeps the part of a horizontal polygon that is out of the desk, in front of the apron. */
function outOfDesk(ring: readonly Vec3[]): Vec3[] {
  const kept: Vec3[] = [];
  ring.forEach((point, index) => {
    const next = ring[(index + 1) % ring.length] ?? point;
    const inside = point[1] >= APRON_FRONT;
    if (inside) kept.push(point);
    if (inside !== next[1] >= APRON_FRONT) {
      const t = (APRON_FRONT - point[1]) / (next[1] - point[1]);
      kept.push(vec.add(point, vec.scale(vec.sub(next, point), t)));
    }
  });
  return kept;
}

export interface DrawerDrawing {
  /** The dark opening in the apron, behind the drawer; absent while it is shut. */
  readonly hollow: string | undefined;
  /**
   * Painter's order is `back`, the letter, then `front`. Only what is out of the desk is drawn; the
   * desktop, painted after, hides whatever its overhang covers.
   */
  readonly back: readonly DrawerPart[];
  /** The inside of the drawer's bottom, in shadow, out of the desk. */
  readonly floor: string | undefined;
  /** The letter lying in the drawer, if any of it is out of the desk. */
  readonly letter: { readonly sheet: string; readonly parts: readonly DrawerPart[] } | undefined;
  readonly front: readonly DrawerPart[];
  readonly area: ReturnType<typeof areaOf>;
}

/** The centre drawer `openness` of the way out: 0 is shut flush with the apron, 1 fully open. */
export function drawerDrawingAt(openness: number): DrawerDrawing {
  const out = Math.max(0, Math.min(1, openness)) * DRAWER.travel;
  const front = APRON_FRONT + out;
  const knob = solid(
    rod(
      [(X0 + X1) / 2, front, DRAWER_FACE.knob.z],
      [0, DRAWER_FACE.knob.length, 0],
      DRAWER_FACE.knob.radius,
    ),
  );
  const face = uprightRect(X0, front, Z0, CENTER_DRAWER.w, DRAWER_FACE.h, 1);
  const area = areaOf(
    [
      ...uprightRect(X0, APRON_FRONT, Z0, CENTER_DRAWER.w, DRAWER_FACE.h, 0),
      ...uprightRect(X0, front, Z0, CENTER_DRAWER.w, DRAWER_FACE.h, 0),
    ].map(project),
  );
  if (out < 0.01) {
    return {
      hollow: undefined,
      back: [],
      floor: undefined,
      letter: undefined,
      front: [{ kind: 'line', d: line(face, true), tone: 'faint' }, knob],
      area,
    };
  }

  const inner = front - DRAWER.panel;
  const box = { x0: X0 + DRAWER.gap, x1: X1 - DRAWER.gap, z0: Z0 + DRAWER.gap, z1: Z1 - 1.2 };
  const back: DrawerPart[] = [];
  if (inner > APRON_FRONT) {
    const length = inner - APRON_FRONT;
    const wall = (x: number) =>
      solid(
        slab({ x, y: APRON_FRONT, w: DRAWER.wall, d: length, r: 0 }, box.z0, box.z1 - box.z0),
        'lo',
      );
    back.push(
      wall(box.x0),
      solid(
        slab(
          {
            x: box.x0 + DRAWER.wall,
            y: APRON_FRONT,
            w: box.x1 - box.x0 - 2 * DRAWER.wall,
            d: length,
            r: 0,
          },
          box.z0,
          DRAWER.floor,
        ),
        'lo',
      ),
    );
  }
  const rightWall =
    inner > APRON_FRONT
      ? solid(
          slab(
            {
              x: box.x1 - DRAWER.wall,
              y: APRON_FRONT,
              w: DRAWER.wall,
              d: inner - APRON_FRONT,
              r: 0,
            },
            box.z0,
            box.z1 - box.z0,
          ),
          'lo',
        )
      : undefined;
  // Raised from its footprint, so its front is a side face shaded exactly like the apron round it.
  const panelBack = Math.max(APRON_FRONT, inner);
  const panel = solid(
    slab(
      { x: X0, y: panelBack, w: CENTER_DRAWER.w, d: front - panelBack, r: 0.8 },
      Z0,
      DRAWER_FACE.h,
      0.3,
    ),
  );

  const { letter } = DRAWER;
  const u: Vec3 = [Math.cos(letter.turn), Math.sin(letter.turn), 0];
  const v: Vec3 = [-Math.sin(letter.turn), Math.cos(letter.turn), 0];
  const origin: Vec3 = vec.sub(
    [(X0 + X1) / 2, inner - DRAWER.letter.back - letter.depth / 2, FLOOR_TOP + 0.05],
    vec.add(vec.scale(u, letter.width / 2), vec.scale(v, letter.depth / 2)),
  );
  const at = (x: number, y: number, z = 0): Vec3 =>
    vec.add(origin, vec.add(vec.add(vec.scale(u, x), vec.scale(v, y)), [0, 0, z]));
  const sheet = outOfDesk([
    at(0, 0),
    at(letter.width, 0),
    at(letter.width, letter.depth),
    at(0, letter.depth),
  ]);
  const flourish = Array.from({ length: 17 }, (_, i): Vec3 => {
    const t = i / 16;
    return at(
      letter.width / 2 - 11 + 22 * t,
      letter.depth / 2 + 5 + 0.5 * Math.sin(t * Math.PI * 2.2),
      0.05,
    );
  });

  return {
    hollow: line(uprightRect(X0, APRON_FRONT, Z0, CENTER_DRAWER.w, DRAWER_FACE.h, 1), true),
    back,
    floor:
      inner > APRON_FRONT
        ? line(
            [
              [box.x0 + DRAWER.wall, APRON_FRONT, FLOOR_TOP],
              [box.x1 - DRAWER.wall, APRON_FRONT, FLOOR_TOP],
              [box.x1 - DRAWER.wall, inner, FLOOR_TOP],
              [box.x0 + DRAWER.wall, inner, FLOOR_TOP],
            ],
            true,
          )
        : undefined,
    letter:
      sheet.length >= 3
        ? {
            sheet: pathOf(sheet.map(project), true),
            parts: [
              {
                kind: 'solid',
                paths: prism(sheet, [0, 0, 0.3]),
                tone: 'lo',
                crease: 'none',
              },
              {
                kind: 'writing',
                text: letter.text,
                transform: planeMatrix(at(0, 0, 0.31), u, v),
                x: letter.width / 2,
                y: letter.depth / 2 + 1.4,
                size: letter.size,
              },
              {
                kind: 'line',
                d: line(flourish.map((point) => vec.add(point, [0, 0, 0.31]))),
                tone: 'mid',
              },
            ],
          }
        : undefined,
    front: [...(rightWall ? [rightWall] : []), panel, knob],
    area,
  };
}
