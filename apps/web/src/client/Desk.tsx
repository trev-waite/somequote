import { useEffect, useRef } from 'react';
import type { QuoteDto } from '../shared/api-contract';
import { Book } from './Book';
import { currentColorScheme, switchColorScheme, useColorScheme } from './color-scheme';
import { CORD, Cord } from './cord';
import { DeskPart } from './DeskPart';
import { Drawer } from './Drawer';
import {
  CORD_ANCHOR,
  DESK_PARTS,
  LAMP_BOX,
  LAMP_LIGHT,
  overlay,
  type Point,
  VIEW_BOX,
} from './desk-geometry';
import { Envelope } from './Envelope';
import { FlipClock, FlipClockDefs } from './FlipClock';
import { Magnifier } from './Magnifier';
import type { Motion } from './reveal';
import { ShipInBottle } from './ShipInBottle';

/** Movement beyond this many CSS pixels turns a press on the cord into a pull rather than a click. */
const DRAG_SLOP_PX = 4;
const CLICK_SUPPRESSION_MS = 400;

const lampSwitchStyle = overlay(LAMP_BOX);
/** The part of the drawing that grabs the cord instead of scrolling the page on touch screens. */
const cordZoneStyle = overlay({
  x: CORD_ANCHOR.x - 13,
  y: CORD_ANCHOR.y - 2,
  width: 26,
  height: CORD.length + 16,
});

/** A smooth line through every link, drawn as beads by the stroke's dash pattern. */
function cordPath(links: readonly Point[]): string {
  const [first, ...rest] = links;
  if (!first) return '';
  let d = `M${first.x.toFixed(2)} ${first.y.toFixed(2)}`;
  let previous = first;
  for (const link of rest) {
    const midX = (previous.x + link.x) / 2;
    const midY = (previous.y + link.y) / 2;
    d += `Q${previous.x.toFixed(2)} ${previous.y.toFixed(2)} ${midX.toFixed(2)} ${midY.toFixed(2)}`;
    previous = link;
  }
  return `${d}L${previous.x.toFixed(2)} ${previous.y.toFixed(2)}`;
}

interface DeskProps {
  readonly remainingMs: number;
  readonly motion: Motion;
  /** Today's quote, for the message the envelope shares, once it has loaded. */
  readonly quote: QuoteDto | undefined;
}

/**
 * A writer's desk with a banker's lamp, a flip clock, and an envelope for sharing. The lamp switches the color scheme (lit is
 * light mode): click it, or pull its cord, which a mouse pointer can also brush and swing. The clock
 * counts down to the next quote. The centre drawer opens on a letter, the ship in a bottle can be
 * knocked off the desk, and a magnifying glass can be picked up to look closer at all of it.
 */
export function Desk({ remainingMs, motion, quote }: DeskProps) {
  const scheme = useColorScheme();
  const sceneRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const cordRef = useRef<SVGPathElement>(null);
  const pullRef = useRef<SVGGElement>(null);
  const aboveRef = useRef<SVGGElement>(null);
  const restRef = useRef<SVGGElement>(null);
  const zoneRef = useRef<HTMLSpanElement>(null);
  const switchRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    const svg = svgRef.current;
    const cordLine = cordRef.current;
    const pull = pullRef.current;
    const zone = zoneRef.current;
    const lampSwitch = switchRef.current;
    if (!scene || !svg || !cordLine || !pull || !zone || !lampSwitch) return;

    const toDrawing = (event: PointerEvent): Point | undefined => {
      const matrix = svg.getScreenCTM?.()?.inverse();
      if (!matrix) return undefined;
      const { x, y } = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
      return { x, y };
    };
    const toggle = () => switchColorScheme(currentColorScheme() === 'light' ? 'dark' : 'light');

    let pullSwitched = false;
    const cord = new Cord(CORD_ANCHOR, {
      onSwitch: () => {
        pullSwitched = true;
        navigator.vibrate?.(8);
        toggle();
      },
    });

    const draw = () => {
      const { links } = cord;
      cordLine.setAttribute('d', cordPath(links));
      cordLine.style.strokeDashoffset = `${-cord.stretch}`;
      const end = links.at(-1);
      const beforeEnd = links.at(-2);
      if (!end || !beforeEnd) return;
      const angle = Math.atan2(beforeEnd.x - end.x, end.y - beforeEnd.y) * (180 / Math.PI);
      pull.setAttribute(
        'transform',
        `translate(${end.x.toFixed(2)} ${end.y.toFixed(2)}) rotate(${angle.toFixed(2)})`,
      );
    };

    let frame = 0;
    let last = 0;
    const loop = (time: number) => {
      cord.advance((time - last) / 1000);
      last = time;
      draw();
      frame = cord.asleep ? 0 : requestAnimationFrame(loop);
    };
    const wake = () => {
      if (frame || cord.asleep) return;
      last = performance.now();
      frame = requestAnimationFrame(loop);
    };
    draw();

    let pulling: { pointerId: number; x: number; y: number; moved: boolean } | null = null;
    let ignoreClickUntil = 0;

    const activate = () => {
      cord.touch(null);
      cord.tug();
      wake();
      toggle();
    };
    const onPress = (event: PointerEvent) => {
      if (event.button !== 0 || pulling) return;
      const point = toDrawing(event);
      pullSwitched = false;
      if (!point || !cord.grab(point)) return;
      event.preventDefault();
      zone.setPointerCapture(event.pointerId);
      pulling = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      cord.touch(null);
      wake();
    };
    const onPull = (event: PointerEvent) => {
      if (!pulling || event.pointerId !== pulling.pointerId) return;
      const point = toDrawing(event);
      if (!point) return;
      if (Math.hypot(event.clientX - pulling.x, event.clientY - pulling.y) > DRAG_SLOP_PX) {
        pulling.moved = true;
      }
      cord.drag(point);
      wake();
    };
    const onLetGo = (event: PointerEvent) => {
      if (!pulling || event.pointerId !== pulling.pointerId) return;
      const tapped = !pulling.moved && !pullSwitched && event.type === 'pointerup';
      ignoreClickUntil = performance.now() + CLICK_SUPPRESSION_MS;
      pulling = null;
      cord.release();
      if (tapped) activate();
      else wake();
    };
    const onHover = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || pulling) return;
      const point = toDrawing(event);
      if (!point) return;
      cord.touch(point);
      wake();
    };
    const onLeave = () => cord.touch(null);
    const onClick = (event: MouseEvent) => {
      if (event.currentTarget === zone && performance.now() < ignoreClickUntil) return;
      activate();
    };

    zone.addEventListener('pointerdown', onPress);
    zone.addEventListener('pointermove', onPull);
    zone.addEventListener('pointerup', onLetGo);
    zone.addEventListener('pointercancel', onLetGo);
    zone.addEventListener('lostpointercapture', onLetGo);
    zone.addEventListener('click', onClick);
    lampSwitch.addEventListener('click', onClick);
    scene.addEventListener('pointermove', onHover);
    scene.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      zone.removeEventListener('pointerdown', onPress);
      zone.removeEventListener('pointermove', onPull);
      zone.removeEventListener('pointerup', onLetGo);
      zone.removeEventListener('pointercancel', onLetGo);
      zone.removeEventListener('lostpointercapture', onLetGo);
      zone.removeEventListener('click', onClick);
      lampSwitch.removeEventListener('click', onClick);
      scene.removeEventListener('pointermove', onHover);
      scene.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  const lit = scheme === 'light';
  return (
    <div ref={sceneRef} className="desk">
      <svg
        ref={svgRef}
        className="iso-svg"
        viewBox={`${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.width} ${VIEW_BOX.height}`}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <filter id="desk-halo" x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <radialGradient id="lamp-pool">
            <stop offset="0" stopColor="var(--lamp-light)" stopOpacity="0.5" />
            <stop offset="0.55" stopColor="var(--lamp-light)" stopOpacity="0.2" />
            <stop offset="1" stopColor="var(--lamp-light)" stopOpacity="0" />
          </radialGradient>
          {/* The same pool in drawing units, for faces that light themselves: `lit` parts. */}
          <radialGradient
            id="lamp-pool-space"
            gradientUnits="userSpaceOnUse"
            cx="0"
            cy="0"
            r="1"
            gradientTransform={`translate(${LAMP_LIGHT.pool.cx} ${LAMP_LIGHT.pool.cy}) scale(${LAMP_LIGHT.pool.rx} ${LAMP_LIGHT.pool.ry})`}
          >
            <stop offset="0" stopColor="var(--lamp-light)" stopOpacity="0.5" />
            <stop offset="0.55" stopColor="var(--lamp-light)" stopOpacity="0.2" />
            <stop offset="1" stopColor="var(--lamp-light)" stopOpacity="0" />
          </radialGradient>
          <clipPath id="desk-top">
            <path d={LAMP_LIGHT.pool.clip} />
          </clipPath>
          <radialGradient id="magnifier-vignette">
            <stop offset="0.62" stopColor="var(--iso-hi)" stopOpacity="0" />
            <stop offset="1" stopColor="var(--iso-hi)" stopOpacity="0.16" />
          </radialGradient>
          <FlipClockDefs />
        </defs>
        {/* Everything a magnifying glass can show; the glass draws after it, outside it. */}
        <g id="desk-scene">
          {DESK_PARTS.map((part, index) => {
            if (part.kind === 'book') {
              return <Book key="book" motion={motion} controls={sceneRef} above={aboveRef} />;
            }
            if (part.kind === 'drawer') {
              return <Drawer key="drawer" motion={motion} controls={sceneRef} />;
            }
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: the parts are a fixed painter's order
              <DeskPart key={index} part={part} />
            );
          })}
          <FlipClock remainingMs={remainingMs} motion={motion} />
          <ShipInBottle motion={motion} controls={sceneRef} />
          <path ref={cordRef} className="lamp-cord" />
          <g ref={pullRef} className="lamp-pull">
            <path className="lamp-pull-body" d="M-0.9 0H0.9L1.1 2.2H-1.1Z" />
            <path
              className="lamp-pull-body"
              d="M0 2.2C2.4 2.2 3.1 5.4 3.1 7.4A3.1 3.1 0 0 1-3.1 7.4C-3.1 5.4-2.4 2.2 0 2.2Z"
            />
            <path className="lamp-pull-crease" d="M-2.2 4.6C-0.8 5.2 0.8 5.2 2.2 4.6" />
          </g>
          {/* Nearer the reader than the lamp, clock, and cord: whatever lifts off the book. */}
          <g ref={aboveRef} />
        </g>
        <g ref={restRef} />
      </svg>
      <button
        ref={switchRef}
        type="button"
        className="lamp-switch"
        style={lampSwitchStyle}
        aria-label={lit ? 'Turn the lamp off (dark mode)' : 'Turn the lamp on (light mode)'}
      />
      <span ref={zoneRef} className="lamp-cord-zone" style={cordZoneStyle} aria-hidden="true" />
      <Envelope motion={motion} quote={quote} />
      <Magnifier motion={motion} controls={sceneRef} rest={restRef} />
    </div>
  );
}
