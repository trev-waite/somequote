import type { Part } from '../desk-geometry';
import {
  areaOf,
  insetPlan,
  line,
  type Plan,
  planeMatrix,
  prism,
  project,
  roundedPlan,
  slab,
  uprightRect,
  type Vec3,
} from '../iso';

/** An index-card file at the back of the desk, between the lamp and the clock. */
export const CARD_BOX = {
  x: -9,
  y: -52,
  w: 24,
  d: 17,
  height: 10,
  wall: 1.2,
  card: { inset: 0.7, rise: 4.5, thickness: 0.35, lift: 14, radius: 0.4 },
  tab: { width: 5, height: 1.6, radius: 0.5 },
  label: { width: 8, height: 3.6, z: 3 },
  capacity: 8,
} as const;

type CardBoxPart = Extract<Part, { kind: 'solid' | 'line' }>;

const PLAN: Plan = { x: CARD_BOX.x, y: CARD_BOX.y, w: CARD_BOX.w, d: CARD_BOX.d, r: 0 };
const INNER = insetPlan(PLAN, CARD_BOX.wall);
const FRONT = CARD_BOX.y + CARD_BOX.d;
const CARD_TOP = CARD_BOX.height + CARD_BOX.card.rise;
const TAB_STOPS = [0.14, 0.5, 0.86] as const;
const DAY_MS = 86_400_000;

/** Where a favorite's tab sits along its card, by its day, so neighbouring days stagger. */
export function tabStopFor(date: string): number {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
  return TAB_STOPS[((day % TAB_STOPS.length) + TAB_STOPS.length) % TAB_STOPS.length] ?? 0.5;
}

/** The walls nearest the reader, which hide the lower part of every card in the box. */
const FRONT_WALL = slab(
  { ...PLAN, y: FRONT - CARD_BOX.wall, w: CARD_BOX.w - CARD_BOX.wall, d: CARD_BOX.wall },
  0,
  CARD_BOX.height,
  0.3,
);
const RIGHT_WALL = slab(
  { ...PLAN, x: CARD_BOX.x + CARD_BOX.w - CARD_BOX.wall, w: CARD_BOX.wall },
  0,
  CARD_BOX.height,
  0.3,
);

const solid = (paths: ReturnType<typeof prism>, tone: 'mid' | 'lo' = 'mid'): CardBoxPart => ({
  kind: 'solid',
  paths,
  tone,
});

/** Where card `index` stands, counting from the back of the box. */
function placement(index: number) {
  const { inset, thickness } = CARD_BOX.card;
  const spacing = (INNER.d - 2 * inset - thickness) / (CARD_BOX.capacity - 1);
  return {
    x: INNER.x + inset,
    y: INNER.y + inset + index * spacing,
    width: INNER.w - 2 * inset,
  };
}

/** A quarter turn of `radius` about a corner, as points in the card's upright plane. */
function arc(cx: number, cz: number, radius: number, from: number, to: number) {
  return Array.from({ length: 7 }, (_, step): [number, number] => {
    const angle = (from + ((to - from) * step) / 6) * (Math.PI / 180);
    return [cx + radius * Math.cos(angle), cz + radius * Math.sin(angle)];
  });
}

/** Card `index` with its tab at `stop`: one piece, the tab curving out of the card's top edge. */
function card(index: number, stop: number): CardBoxPart {
  const { thickness, radius: r } = CARD_BOX.card;
  const { width: tw, height: th, radius: tr } = CARD_BOX.tab;
  const { x, y, width } = placement(index);
  const left = x + stop * (width - tw);
  const right = left + tw;
  const { wall } = CARD_BOX;
  const outline = [
    ...arc(x + r, wall + r, r, 180, 270),
    ...arc(x + width - r, wall + r, r, 270, 360),
    ...arc(x + width - r, CARD_TOP - r, r, 0, 90),
    ...arc(right + tr, CARD_TOP + tr, tr, 270, 180),
    ...arc(right - tr, CARD_TOP + th - tr, tr, 0, 90),
    ...arc(left + tr, CARD_TOP + th - tr, tr, 90, 180),
    ...arc(left - tr, CARD_TOP + tr, tr, 360, 270),
    ...arc(x + r, CARD_TOP - r, r, 90, 180),
  ];
  return solid(
    prism(
      outline.map(([px, pz]): Vec3 => [px, y, pz]),
      [0, thickness, 0],
    ),
    'lo',
  );
}

export interface CardBoxDrawing {
  readonly back: readonly CardBoxPart[];
  readonly hollow: string;
  /** The cards, from the back of the box to the front. */
  readonly cards: readonly CardBoxPart[];
  readonly front: readonly CardBoxPart[];
  /** Places the 24-unit heart inside the label frame on the box's front. */
  readonly mark: string;
}

/**
 * One card for each favorite up to the box's capacity, given their tabs newest first: the newest
 * stands at the front, which is the slot the first card on the sheet flies from.
 */
export function cardBoxDrawingFor(tabs: readonly number[]): CardBoxDrawing {
  const shown = tabs.slice(0, CARD_BOX.capacity).reverse();
  const { height, label } = CARD_BOX;
  const labelX = CARD_BOX.x + (CARD_BOX.w - label.width) / 2;
  const markSize = label.height - 0.8;
  return {
    back: [solid(slab(PLAN, 0, height, 0.3))],
    hollow: line(roundedPlan(INNER, height), true),
    cards: shown.map((stop, index) => card(index, stop)),
    front: [
      solid(FRONT_WALL),
      solid(RIGHT_WALL),
      {
        kind: 'line',
        d: line(uprightRect(labelX, FRONT, label.z, label.width, label.height, 0.3), true),
        tone: 'lo',
      },
    ],
    mark: `${planeMatrix(
      [labelX + (label.width - markSize) / 2, FRONT, label.z + label.height - 0.4],
      [1, 0, 0],
      [0, 0, -1],
    )} scale(${markSize / 24})`,
  };
}

/** Drawing units around the box's outline, so the desk's smallest size still gives a 44px target. */
const TARGET_PAD = 5;

export const CARD_BOX_AREA = areaOf(
  [...roundedPlan(PLAN, 0), ...roundedPlan(PLAN, CARD_TOP + CARD_BOX.tab.height)]
    .map(project)
    .flatMap(({ x, y }) =>
      Array.from({ length: 8 }, (_, step) => {
        const angle = (step * Math.PI) / 4;
        return { x: x + TARGET_PAD * Math.cos(angle), y: y + TARGET_PAD * Math.sin(angle) };
      }),
    ),
);

const around = ({ x, y, width, height }: { x: number; y: number; width: number; height: number }) =>
  `M${x - width} ${y - 2 * height}H${x + 2 * width}V${y + 2 * height}H${x - width}Z`;

/**
 * The cards as they hang above the box once lifted clear of its walls, where the sheet's cards take
 * over: each face's size in drawing units, its screen directions, and each slot's center as
 * fractions of the target's box.
 */
export const CARD_FLIGHT = (() => {
  const { thickness, lift } = CARD_BOX.card;
  const face = { width: INNER.w - 2 * CARD_BOX.card.inset, height: CARD_TOP - CARD_BOX.wall };
  const { box } = CARD_BOX_AREA;
  const slots = Array.from({ length: CARD_BOX.capacity }, (_, index) => {
    const { x, y, width } = placement(index);
    const center = project([x + width / 2, y + thickness, CARD_BOX.wall + face.height / 2 + lift]);
    return { x: (center.x - box.x) / box.width, y: (center.y - box.y) / box.height };
  });
  return {
    face,
    tab: CARD_BOX.tab,
    across: project([1, 0, 0]),
    down: project([0, 0, -1]),
    /** How far lifting moves the cards up the screen, in drawing units. */
    lift: project([0, 0, lift]).y,
    box,
    /**
     * Each near wall cut out of the space around the box, the only place a card is ever clipped;
     * a small clip keeps its mask cheap to redraw.
     */
    walls: { front: around(box) + FRONT_WALL.outline, right: around(box) + RIGHT_WALL.outline },
    slots,
  };
})();
