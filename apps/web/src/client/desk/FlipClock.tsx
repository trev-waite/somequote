import { type Ref, useEffect, useMemo, useRef, useState } from 'react';
import { countdownParts } from '../publication/countdown';
import type { Motion } from '../publication/reveal';
import { CLOCK_FACE } from './desk-geometry';
import { planeMatrix, type Vec3, vec } from './iso';

const { card } = CLOCK_FACE;
const HINGE = card.height / 2;
const DIGIT_SIZE = card.height * 0.74;
/** Instrument Serif's figures sit this far below the middle of the em box. */
const DIGIT_BASELINE = HINGE + DIGIT_SIZE * 0.34;

const FLIP = { fallMs: 300, settleMs: 190, bounceDegrees: 11, shade: 0.5 } as const;

const RADIANS = Math.PI / 180;

function originOf(x: number, y: number): Vec3 {
  return vec.add(
    CLOCK_FACE.origin,
    vec.add(vec.scale(CLOCK_FACE.u, x), vec.scale(CLOCK_FACE.v, y)),
  );
}

function flapMatrix(cardOrigin: Vec3, half: 'top' | 'bottom', degrees: number): string {
  const { v, normal } = CLOCK_FACE;
  const out = half === 'top' ? -1 : 1;
  const turned = vec.add(
    vec.scale(v, Math.cos(degrees * RADIANS)),
    vec.scale(normal, out * Math.sin(degrees * RADIANS)),
  );
  const hinge = vec.add(cardOrigin, vec.scale(v, HINGE));
  return planeMatrix(vec.add(hinge, vec.scale(turned, -HINGE)), CLOCK_FACE.u, turned);
}

export function flapAngle(elapsedMs: number): { degrees: number; done: boolean } {
  if (elapsedMs < FLIP.fallMs) {
    const p = elapsedMs / FLIP.fallMs;
    return { degrees: 180 * (0.3 * p + 0.7 * p * p), done: false };
  }
  const q = Math.min(1, (elapsedMs - FLIP.fallMs) / FLIP.settleMs);
  const lift = FLIP.bounceDegrees * Math.abs(Math.sin(2 * Math.PI * q)) * (1 - q) ** 1.5;
  return { degrees: 180 - lift, done: q >= 1 };
}

function Digits({ text, ref }: { text: string; ref?: Ref<SVGTextElement> }) {
  return (
    <>
      <rect className="flip-card" width={card.width} height={card.height} rx="1.4" />
      <text
        ref={ref}
        className="flip-digits"
        x={card.width / 2}
        y={DIGIT_BASELINE}
        fontSize={DIGIT_SIZE}
      >
        {text}
      </text>
    </>
  );
}

interface FlipCardProps {
  readonly x: number;
  readonly y: number;
  readonly value: string;
  readonly motion: Motion;
}

function FlipCard({ x, y, value, motion }: FlipCardProps) {
  const [initial] = useState(value);
  const shown = useRef(value);
  const top = useRef<SVGTextElement>(null);
  const bottom = useRef<SVGTextElement>(null);
  const fallingText = useRef<SVGTextElement>(null);
  const landingText = useRef<SVGTextElement>(null);
  const falling = useRef<SVGGElement>(null);
  const landing = useRef<SVGGElement>(null);
  const fallingShade = useRef<SVGRectElement>(null);
  const landingShade = useRef<SVGRectElement>(null);
  const origin = useMemo(() => originOf(x, y), [x, y]);

  useEffect(() => {
    const from = shown.current;
    if (value === from) return;
    shown.current = value;
    const topText = top.current;
    const bottomText = bottom.current;
    const fallText = fallingText.current;
    const landText = landingText.current;
    const fallFlap = falling.current;
    const landFlap = landing.current;
    if (!topText || !bottomText || !fallText || !landText || !fallFlap || !landFlap) return;

    const settle = () => {
      bottomText.textContent = value;
      fallFlap.setAttribute('visibility', 'hidden');
      landFlap.setAttribute('visibility', 'hidden');
    };
    topText.textContent = value;
    if (motion === 'reduced') {
      settle();
      return;
    }
    bottomText.textContent = from;
    fallText.textContent = from;
    landText.textContent = value;

    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const { degrees, done } = flapAngle(now - start);
      const isFalling = degrees < 90;
      fallFlap.setAttribute('visibility', isFalling ? 'visible' : 'hidden');
      landFlap.setAttribute('visibility', isFalling ? 'hidden' : 'visible');
      if (isFalling) {
        fallFlap.setAttribute('transform', flapMatrix(origin, 'top', degrees));
        fallingShade.current?.setAttribute('opacity', `${(FLIP.shade * degrees) / 90}`);
      } else {
        landFlap.setAttribute('transform', flapMatrix(origin, 'bottom', 180 - degrees));
        landingShade.current?.setAttribute('opacity', `${(FLIP.shade * (180 - degrees)) / 90}`);
      }
      if (done) {
        frame = 0;
        settle();
      } else {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      settle();
    };
  }, [value, motion, origin]);

  const flat = planeMatrix(origin, CLOCK_FACE.u, CLOCK_FACE.v);
  return (
    <g className="flip">
      <g transform={flat}>
        <g clipPath="url(#flip-top-half)">
          <Digits ref={top} text={initial} />
        </g>
        <g clipPath="url(#flip-bottom-half)">
          <Digits ref={bottom} text={initial} />
        </g>
      </g>
      <g ref={landing} visibility="hidden" clipPath="url(#flip-bottom-half)">
        <Digits ref={landingText} text={initial} />
        <rect
          ref={landingShade}
          className="flip-shade"
          y={HINGE}
          width={card.width}
          height={HINGE}
          opacity="0"
        />
      </g>
      <g ref={falling} visibility="hidden" clipPath="url(#flip-top-half)">
        <Digits ref={fallingText} text={initial} />
        <rect
          ref={fallingShade}
          className="flip-shade"
          width={card.width}
          height={HINGE}
          opacity="0"
        />
      </g>
      <g transform={flat}>
        <line className="flip-hinge" x1="0" y1={HINGE} x2={card.width} y2={HINGE} />
        <circle className="flip-pin" cx="0.6" cy={HINGE} r="0.55" />
        <circle className="flip-pin" cx={card.width - 0.6} cy={HINGE} r="0.55" />
      </g>
    </g>
  );
}

export function FlipClockDefs() {
  return (
    <>
      <clipPath id="flip-top-half">
        <rect width={card.width} height={HINGE - 0.2} />
      </clipPath>
      <clipPath id="flip-bottom-half">
        <rect y={HINGE + 0.2} width={card.width} height={HINGE - 0.2} />
      </clipPath>
    </>
  );
}

export function FlipClock({ remainingMs, motion }: { remainingMs: number; motion: Motion }) {
  const { hours, minutes, seconds } = countdownParts(remainingMs);
  const values = [hours, minutes, seconds].map((part) => String(part).padStart(2, '0'));
  const { window } = CLOCK_FACE;
  return (
    <g className="flip-clock">
      <rect
        className="flip-window"
        transform={planeMatrix(CLOCK_FACE.origin, CLOCK_FACE.u, CLOCK_FACE.v)}
        x={window.x}
        y={window.y}
        width={window.width}
        height={window.height}
        rx="2"
      />
      {CLOCK_FACE.cards.map(({ x, y }, index) => (
        <FlipCard key={x} x={x} y={y} value={values[index] ?? '00'} motion={motion} />
      ))}
    </g>
  );
}
