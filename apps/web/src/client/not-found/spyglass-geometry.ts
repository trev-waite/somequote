import type { Part, Tone } from '../desk/desk-geometry';
import { areaOf, line, prism, project, SCREEN, type Vec3, vec } from '../desk/iso';
import { DIGIT_TARGETS, ZERO_TOP } from './digit-geometry';
import { DIGITS_BACK_AT, RETURN_AT, SHOWN_AT, SWITCHING } from './quote-letters';

export interface SpyglassPose {
  readonly lift: number;
  readonly yaw: number;
  readonly pitch: number;
  /** How far the draw tubes have slid out, from closed (0) to open (1). */
  readonly extend: number;
  /** From resting on the 0 (0) to held at the lookout (1). */
  readonly away: number;
}

export const RESTING: SpyglassPose = { lift: 0, yaw: 0, pitch: 0, extend: 0, away: 0 };
const held = (pose: Partial<SpyglassPose>): SpyglassPose => ({ ...RESTING, ...pose });

interface Frame {
  readonly center: Vec3;
  readonly across: Vec3;
  readonly along: Vec3;
  readonly up: Vec3;
}

const HEADING = (-8 * Math.PI) / 180;
const HOOD = { from: 21, to: 25, radius: 4.3, glass: 3.4 } as const;
const EYE = { cup: 2.1, tube: 1.9, glass: 1.2, length: 4 } as const;
/** The middle of the closed spyglass, which it turns about while resting on the 0. */
const MIDDLE = 9;
const SIZE = 1.3;
const LOOKOUT: Vec3 = [70, 100, 6.5];

function aimAt(target: Vec3): Partial<SpyglassPose> {
  const [x, y, z] = vec.normalize(vec.sub(target, LOOKOUT));
  return { yaw: Math.atan2(y, x) - HEADING, pitch: Math.asin(z) };
}

const OPEN = { lift: 14, extend: 1 } as const;
const TURN_MS = 350;
const LOOKS = DIGIT_TARGETS.map((target) => held({ away: 1, extend: 1, ...aimAt(target) }));
const PARKED = held({ away: 1, extend: 1 });
const RAISE_MS = 600;

const scanFrom = (start: number) =>
  LOOKS.flatMap((pose, index): (readonly [number, SpyglassPose])[] => [
    [start + index * SWITCHING.beat, pose],
    [start + (index + 1) * SWITCHING.beat - TURN_MS, pose],
  ]);

const KEYFRAMES: readonly (readonly [ms: number, pose: SpyglassPose])[] = [
  [0, RESTING],
  [300, held({ lift: 12 })],
  [620, held({ lift: 14, extend: 1.12 })],
  [850, held(OPEN)],
  ...scanFrom(SWITCHING.start),
  [SHOWN_AT, PARKED],
  [RETURN_AT - RAISE_MS, PARKED],
  ...scanFrom(RETURN_AT),
  [DIGITS_BACK_AT, LOOKS.at(-1) ?? RESTING],
  [DIGITS_BACK_AT + 700, held(OPEN)],
  [DIGITS_BACK_AT + 1100, held({ lift: 12 })],
  [DIGITS_BACK_AT + 1450, RESTING],
  [DIGITS_BACK_AT + 1570, held({ lift: 1 })],
  [DIGITS_BACK_AT + 1690, RESTING],
];

export const LOOK_MS = KEYFRAMES.at(-1)?.[0] ?? 0;

const smooth = (t: number) => t * t * (3 - 2 * t);

/** While held still the same pose comes back each time, so a caller can tell nothing moved. */
export function spyglassAt(ms: number): SpyglassPose {
  const next = KEYFRAMES.findIndex(([at]) => at > ms);
  const before = KEYFRAMES[next - 1];
  const after = KEYFRAMES[next];
  if (!before || !after) return RESTING;
  if (before[1] === after[1]) return before[1];
  const t = smooth((ms - before[0]) / (after[0] - before[0]));
  const blend = (key: keyof SpyglassPose) => before[1][key] + (after[1][key] - before[1][key]) * t;
  return {
    lift: blend('lift'),
    yaw: blend('yaw'),
    pitch: blend('pitch'),
    extend: blend('extend'),
    away: blend('away'),
  };
}

function frameAt({ lift, yaw, pitch, extend, away }: SpyglassPose): Frame {
  const heading = HEADING + yaw;
  const across: Vec3 = [Math.sin(heading), -Math.cos(heading), 0];
  const along: Vec3 = [
    Math.cos(heading) * Math.cos(pitch),
    Math.sin(heading) * Math.cos(pitch),
    Math.sin(pitch),
  ];
  const resting = vec.add(ZERO_TOP, [0, 0, HOOD.radius * SIZE + lift]);
  const looking = vec.sub(LOOKOUT, vec.scale(along, (eyeEnd(extend) - MIDDLE) * SIZE));
  return {
    center: vec.add(vec.scale(resting, 1 - away), vec.scale(looking, away)),
    across: vec.scale(across, SIZE),
    along: vec.scale(along, SIZE),
    up: vec.scale(vec.cross(across, along), SIZE),
  };
}

/** A point on the spyglass: along it from the barrel's back toward the lens, out from its axis. */
const spot = ({ center, across, along, up }: Frame, l: number, a = 0, u = 0): Vec3 =>
  vec.add(
    center,
    vec.add(vec.scale(along, l - MIDDLE), vec.add(vec.scale(across, a), vec.scale(up, u))),
  );

const ring = (frame: Frame, l: number, radius: number, from = 0, to = Math.PI * 2, steps = 24) =>
  Array.from({ length: steps + 1 }, (_, step) => {
    const angle = from + ((to - from) * step) / steps;
    return spot(frame, l, radius * Math.cos(angle), radius * Math.sin(angle));
  });

interface Section {
  readonly from: number;
  readonly to: number;
  readonly radius: number;
  readonly tone: Tone;
  readonly bands?: readonly number[];
}

/** The visible length of each piece, eyepiece first; draw tubes hide inside the barrel when closed. */
function sectionsAt(extend: number): Section[] {
  const first = 1.4 + 13 * extend;
  const second = 1.4 + 11 * extend;
  const firstBack = -first;
  const secondBack = firstBack - second;
  const eye = secondBack - EYE.length;
  const sections: Section[] = [
    { from: eye, to: eye + 1.2, radius: EYE.cup, tone: 'mid' },
    { from: eye + 1.2, to: secondBack, radius: EYE.tube, tone: 'mid' },
    { from: secondBack, to: secondBack + 1.4, radius: 2.7, tone: 'hi' },
    { from: secondBack + 1.4, to: firstBack, radius: 2.4, tone: 'mid' },
    { from: firstBack, to: firstBack + 1.4, radius: 3.5, tone: 'hi' },
    { from: firstBack + 1.4, to: 0, radius: 3.2, tone: 'mid' },
    { from: 0, to: 1.6, radius: 4.1, tone: 'hi' },
    { from: 1.6, to: HOOD.from, radius: 3.8, tone: 'hi', bands: [8, 14] },
    { from: HOOD.from, to: HOOD.to, radius: HOOD.radius, tone: 'hi' },
  ];
  return sections.filter(({ from, to }) => to - from > 0.01);
}

const eyeEnd = (extend: number) => sectionsAt(extend)[0]?.from ?? 0;

export type SpyglassPart =
  | Extract<Part, { kind: 'solid' | 'line' }>
  | { readonly kind: 'glass'; readonly d: string; readonly glints: readonly string[] };

function glass(frame: Frame, l: number, radius: number, glints: boolean): SpyglassPart {
  const arc = (r: number, from?: number, to?: number, steps?: number) =>
    line(ring(frame, l, r, from, to, steps));
  return {
    kind: 'glass',
    d: `${arc(radius)}Z`,
    glints: glints ? [arc(radius * 0.7, 1.9, 2.75, 8), arc(radius * 0.7, 2.95, 3.2, 3)] : [],
  };
}

export function spyglassDrawingAt(pose: SpyglassPose) {
  const frame = frameAt(pose);
  const lensFacing = vec.dot(frame.along, SCREEN.out) > 0;
  const facing = Math.atan2(vec.dot(frame.up, SCREEN.out), vec.dot(frame.across, SCREEN.out));
  const pieces = sectionsAt(pose.extend).map(
    ({ from, to, radius, tone, bands = [] }): SpyglassPart[] => [
      {
        kind: 'solid',
        paths: prism(ring(frame, from, radius).slice(1), vec.scale(frame.along, to - from), 0.25),
        tone,
      },
      ...bands.map(
        (l): SpyglassPart => ({
          kind: 'line',
          d: line(ring(frame, l, radius, facing - Math.PI / 2, facing + Math.PI / 2, 16)),
          tone: 'faint',
        }),
      ),
    ],
  );
  const parts = lensFacing
    ? [...pieces.flat(), glass(frame, HOOD.to, HOOD.glass, true)]
    : [...pieces.reverse().flat(), glass(frame, eyeEnd(pose.extend), EYE.glass, false)];
  return { parts, shadow: Math.max(0, 1 - pose.lift / 10) * (1 - pose.away) };
}

const RESTING_FRAME = frameAt(RESTING);

export const SPYGLASS_HALO = line(
  [
    [-5.5, -8],
    [-5.5, 26],
    [5.5, 26],
    [5.5, -8],
  ].map(([across = 0, along = 0]) => spot(RESTING_FRAME, along, across, -HOOD.radius)),
  true,
);

const outlineOf = (frame: Frame, extend: number, margin: number) =>
  [eyeEnd(extend), HOOD.to].flatMap((l) =>
    ring(frame, l, HOOD.radius + margin, 0, Math.PI * 2, 16).map(project),
  );

/** Wider than the spyglass itself, so the slim tube is still easy to tap. */
export const SPYGLASS_AREA = areaOf(outlineOf(RESTING_FRAME, 0, 4.5));

export const SPYGLASS_REACH = Array.from({ length: 161 }, (_, step) => {
  const pose = spyglassAt((step / 160) * LOOK_MS);
  return outlineOf(frameAt(pose), pose.extend, 1.5);
}).flat();
