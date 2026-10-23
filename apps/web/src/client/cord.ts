import type { Point } from './iso';

export const CORD = {
  length: 36,
  links: 14,
  gravity: 1800,
  damping: 0.99,
  iterations: 20,
  stepSeconds: 1 / 120,
  switchAt: 9,
  maxStretch: 14,
  pullWeight: 3,
  grabRadius: 16,
  fingerRadius: 4.5,
  recoil: { stiffness: 900, damping: 22 },
  tug: { seconds: 0.22, stretch: 12, recoil: { stiffness: 360, damping: 30 } },
  maxLinkSpeed: 6,
} as const;

interface Link {
  x: number;
  y: number;
  px: number;
  py: number;
  w: number;
}

interface CordOptions {
  readonly onSwitch: () => void;
}

const STILL_SPEED = 0.002;
const STILL_STEPS = 45;

export class Cord {
  readonly #anchor: Point;
  readonly #links: Link[];
  readonly #segments: (readonly [Link, Link, number])[];
  readonly #onSwitch: () => void;
  readonly #rest = CORD.length / CORD.links;
  #stretch = 0;
  #stretchVelocity = 0;
  #recoil: { readonly stiffness: number; readonly damping: number } = CORD.recoil;
  #tug: { elapsed: number; from: number } | null = null;
  #grabbed: {
    link: Link;
    index: number;
    offset: Point;
    target: Point;
    switched: boolean;
  } | null = null;
  #finger: Point | null = null;
  #fingerFrom: Point | null = null;
  #carry = 0;
  #stillSteps = STILL_STEPS;

  constructor(anchor: Point, { onSwitch }: CordOptions) {
    this.#anchor = anchor;
    this.#onSwitch = onSwitch;
    this.#links = Array.from({ length: CORD.links + 1 }, (_, index) => {
      const y = anchor.y + index * this.#rest;
      const w = index === 0 ? 0 : index === CORD.links ? 1 / CORD.pullWeight : 1;
      return { x: anchor.x, y, px: anchor.x, py: y, w };
    });
    this.#segments = this.#links.flatMap((link, index) => {
      const next = this.#links[index + 1];
      return next ? [[link, next, index] as const] : [];
    });
  }

  get links(): readonly Point[] {
    return this.#links;
  }

  get stretch(): number {
    return this.#stretch;
  }

  get grabbed(): boolean {
    return this.#grabbed !== null;
  }

  get asleep(): boolean {
    return this.#stillSteps >= STILL_STEPS;
  }

  advance(seconds: number): void {
    if (this.asleep) return;
    this.#carry += Math.min(seconds, 0.1);
    while (this.#carry >= CORD.stepSeconds) {
      this.#carry -= CORD.stepSeconds;
      this.#step(CORD.stepSeconds);
    }
  }

  grab(point: Point): boolean {
    let nearest: { link: Link; index: number; distance: number } | null = null;
    for (const [index, link] of this.#links.entries()) {
      if (index === 0) continue;
      const distance = Math.hypot(link.x - point.x, link.y - point.y);
      if (!nearest || distance < nearest.distance) nearest = { link, index, distance };
    }
    if (!nearest || nearest.distance > CORD.grabRadius) return false;
    const { link, index } = nearest;
    this.#tug = null;
    this.#recoil = CORD.recoil;
    this.#grabbed = {
      link,
      index,
      offset: { x: point.x - link.x, y: point.y - link.y },
      target: { x: link.x, y: link.y },
      switched: false,
    };
    this.#stretchVelocity = 0;
    this.drag(point);
    return true;
  }

  drag(point: Point): void {
    const grabbed = this.#grabbed;
    if (!grabbed) return;
    const dx = point.x - grabbed.offset.x - this.#anchor.x;
    const dy = point.y - grabbed.offset.y - this.#anchor.y;
    const distance = Math.hypot(dx, dy);
    const reach = grabbed.index * this.#rest;
    const over = distance - reach;
    this.#stretch = over > 0 ? CORD.maxStretch * (1 - Math.exp(-over / CORD.maxStretch)) : 0;
    const limit = reach + this.#stretch;
    const scale = distance > limit ? limit / distance : 1;
    grabbed.target = {
      x: this.#anchor.x + dx * scale,
      y: this.#anchor.y + dy * scale,
    };
    if (!grabbed.switched && this.#stretch >= CORD.switchAt) {
      grabbed.switched = true;
      this.#onSwitch();
    }
    this.#wake();
  }

  release(): void {
    this.#grabbed = null;
    this.#wake();
  }

  touch(finger: Point | null): void {
    if (!finger) {
      this.#sweepFinger();
      this.#finger = null;
      return;
    }
    const from = this.#finger ?? finger;
    this.#fingerFrom ??= from;
    this.#finger = finger;
    if (this.#sweeps(from, finger)) this.#wake();
  }

  tug(): void {
    if (this.#grabbed) return;
    this.#tug = { elapsed: 0, from: this.#stretch };
    this.#stretchVelocity = 0;
    this.#recoil = CORD.tug.recoil;
    this.#wake();
  }

  settle(): void {
    this.#grabbed = null;
    this.#tug = null;
    this.#finger = null;
    this.#fingerFrom = null;
    this.#stretch = 0;
    this.#stretchVelocity = 0;
    this.#carry = 0;
    for (const [index, link] of this.#links.entries()) {
      link.x = link.px = this.#anchor.x;
      link.y = link.py = this.#anchor.y + index * this.#rest;
    }
    this.#stillSteps = STILL_STEPS;
  }

  #wake(): void {
    this.#stillSteps = 0;
  }

  #sweeps(from: Point, to: Point): boolean {
    const margin = CORD.fingerRadius + this.#rest;
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / margin));
    for (let step = 0; step <= steps; step++) {
      const x = from.x + ((to.x - from.x) * step) / steps;
      const y = from.y + ((to.y - from.y) * step) / steps;
      const near = this.#links.some(
        (link) => Math.abs(link.x - x) < margin && Math.abs(link.y - y) < margin,
      );
      if (near) return true;
    }
    return false;
  }

  #step(dt: number): void {
    const grabbed = this.#grabbed;
    if (!grabbed) {
      const tug = this.#tug;
      if (tug) {
        tug.elapsed = Math.min(CORD.tug.seconds, tug.elapsed + dt);
        const progress = tug.elapsed / CORD.tug.seconds;
        const eased = progress * progress * (3 - 2 * progress);
        this.#stretch = tug.from + (Math.max(tug.from, CORD.tug.stretch) - tug.from) * eased;
        if (progress === 1) this.#tug = null;
      } else {
        const { stiffness, damping } = this.#recoil;
        this.#stretchVelocity +=
          (-stiffness * this.#stretch - damping * this.#stretchVelocity) * dt;
        this.#stretch += this.#stretchVelocity * dt;
        if (this.#stretch < 0) {
          this.#stretch = 0;
          this.#stretchVelocity = 0;
        }
      }
    }

    let fastest = 0;
    for (const link of this.#links) {
      if (link.w === 0 || link === grabbed?.link) continue;
      let vx = (link.x - link.px) * CORD.damping;
      let vy = (link.y - link.py) * CORD.damping;
      const speed = Math.hypot(vx, vy);
      if (speed > CORD.maxLinkSpeed) {
        vx *= CORD.maxLinkSpeed / speed;
        vy *= CORD.maxLinkSpeed / speed;
      }
      fastest = Math.max(fastest, speed);
      link.px = link.x;
      link.py = link.y;
      link.x += vx;
      link.y += vy + CORD.gravity * dt * dt;
    }
    if (grabbed) {
      grabbed.link.px = grabbed.link.x;
      grabbed.link.py = grabbed.link.y;
      grabbed.link.x = grabbed.target.x;
      grabbed.link.y = grabbed.target.y;
    }

    this.#sweepFinger();
    const stretched = grabbed?.index ?? CORD.links;
    for (let iteration = 0; iteration < CORD.iterations; iteration++) {
      for (const [a, b, index] of this.#segments) {
        const rest = this.#rest + (index < stretched ? this.#stretch / stretched : 0);
        this.#constrain(a, b, rest, grabbed?.link);
      }
    }
    this.#pushFrom(this.#finger);

    const settled =
      !grabbed && fastest < STILL_SPEED && this.#stretch === 0 && this.#stretchVelocity === 0;
    this.#stillSteps = settled ? this.#stillSteps + 1 : 0;
  }

  #constrain(a: Link, b: Link, rest: number, held: Link | undefined): void {
    const wa = a === held ? 0 : a.w;
    const wb = b === held ? 0 : b.w;
    const total = wa + wb;
    if (total === 0) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.hypot(dx, dy) || 1e-6;
    const correction = (distance - rest) / distance / total;
    a.x += dx * correction * wa;
    a.y += dy * correction * wa;
    b.x -= dx * correction * wb;
    b.y -= dy * correction * wb;
  }

  /** Moves the fingertip in small steps from where it was, so a fast swipe cannot skip the cord. */
  #sweepFinger(): void {
    const to = this.#finger;
    const from = this.#fingerFrom ?? to;
    if (!from || !to) return;
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / (CORD.fingerRadius / 2)));
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      this.#pushFrom({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    }
    this.#fingerFrom = null;
  }

  #pushFrom(finger: Point | null): void {
    if (!finger) return;
    for (const link of this.#links) {
      if (link.w === 0 || link === this.#grabbed?.link) continue;
      const dx = link.x - finger.x;
      const dy = link.y - finger.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= CORD.fingerRadius) continue;
      const scale = distance > 1e-6 ? CORD.fingerRadius / distance : 0;
      link.x = scale ? finger.x + dx * scale : finger.x + CORD.fingerRadius;
      link.y = scale ? finger.y + dy * scale : finger.y;
    }
  }
}
