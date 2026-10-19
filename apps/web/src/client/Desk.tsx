import { type CSSProperties, useEffect, useRef } from 'react';
import { currentColorScheme, switchColorScheme, useColorScheme } from './color-scheme';
import { CORD, Cord } from './cord';
import {
  CORD_ANCHOR,
  DESK_PARTS,
  LAMP_BOX,
  LAMP_LIGHT,
  type Part,
  type Point,
  type Tone,
  VIEW_BOX,
} from './desk-geometry';
import { FlipClock, FlipClockDefs } from './FlipClock';
import type { SolidPaths } from './iso';
import type { Motion } from './reveal';

/** Movement beyond this many CSS pixels turns a press on the cord into a pull rather than a click. */
const DRAG_SLOP_PX = 4;
const CLICK_SUPPRESSION_MS = 400;

/** Places an overlay over a region of the drawing given in viewBox units. */
function overlay({ x, y, width, height }: { x: number; y: number; width: number; height: number }) {
  return {
    left: `${((x - VIEW_BOX.x) / VIEW_BOX.width) * 100}%`,
    top: `${((y - VIEW_BOX.y) / VIEW_BOX.height) * 100}%`,
    width: `${(width / VIEW_BOX.width) * 100}%`,
    height: `${(height / VIEW_BOX.height) * 100}%`,
  } satisfies CSSProperties;
}

const lampSwitchStyle = overlay(LAMP_BOX);
/** The part of the drawing that grabs the cord instead of scrolling the page on touch screens. */
const cordZoneStyle = overlay({
  x: CORD_ANCHOR.x - 13,
  y: CORD_ANCHOR.y - 2,
  width: 26,
  height: CORD.length + 16,
});

function Solid({
  paths,
  tone,
  crease = 'faint',
}: {
  paths: SolidPaths;
  tone: Tone;
  crease?: Tone | 'none';
}) {
  return (
    <g className="iso-solid">
      <path className="iso-fill" d={paths.fill} />
      {paths.shades.map((d, shade) =>
        d ? <path key={d} className="iso-shade" data-shade={shade} d={d} /> : null,
      )}
      <path className="iso-top" d={paths.top} />
      {crease !== 'none' && paths.crease && (
        <path className="iso-line" data-tone={crease} d={paths.crease} />
      )}
      {crease !== 'none' && paths.bevel && (
        <path className="iso-line" data-tone={crease} d={paths.bevel} />
      )}
      <path className="iso-line" data-tone={tone} d={paths.outline} />
    </g>
  );
}

function PartView({ part }: { part: Part }) {
  switch (part.kind) {
    case 'halo':
      return <path className="iso-halo" d={part.d} filter="url(#desk-halo)" />;
    case 'solid':
      return (
        <Solid
          paths={part.paths}
          tone={part.tone}
          {...(part.crease ? { crease: part.crease } : {})}
        />
      );
    case 'line':
      return (
        <path
          className="iso-line"
          data-tone={part.tone}
          data-dotted={part.dotted ? '' : undefined}
          d={part.d}
        />
      );
    case 'writing':
      return (
        <text
          className="desk-writing"
          transform={part.transform}
          x={part.x}
          y={part.y}
          fontSize={part.size}
        >
          {part.text}
        </text>
      );
    case 'light':
      return part.layer === 'pool' ? (
        <ellipse
          className="lamp-light lamp-pool"
          cx={LAMP_LIGHT.pool.cx}
          cy={LAMP_LIGHT.pool.cy}
          rx={LAMP_LIGHT.pool.rx}
          ry={LAMP_LIGHT.pool.ry}
          fill="url(#lamp-pool)"
          clipPath="url(#desk-top)"
        />
      ) : (
        <path className="lamp-light lamp-rim" d={LAMP_LIGHT.rim} />
      );
  }
}

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
}

/**
 * A writer's desk with a banker's lamp and a flip clock. The lamp switches the color scheme (lit is
 * light mode): click it, or pull its cord, which a mouse pointer can also brush and swing. The clock
 * counts down to the next quote.
 */
export function Desk({ remainingMs, motion }: DeskProps) {
  const scheme = useColorScheme();
  const sceneRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const cordRef = useRef<SVGPathElement>(null);
  const pullRef = useRef<SVGGElement>(null);
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
          <clipPath id="desk-top">
            <path d={LAMP_LIGHT.pool.clip} />
          </clipPath>
          <FlipClockDefs />
        </defs>
        {DESK_PARTS.map((part, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the parts are a fixed painter's order
          <PartView key={index} part={part} />
        ))}
        <FlipClock remainingMs={remainingMs} motion={motion} />
        <path ref={cordRef} className="lamp-cord" />
        <g ref={pullRef} className="lamp-pull">
          <path className="lamp-pull-body" d="M-0.9 0H0.9L1.1 2.2H-1.1Z" />
          <path
            className="lamp-pull-body"
            d="M0 2.2C2.4 2.2 3.1 5.4 3.1 7.4A3.1 3.1 0 0 1-3.1 7.4C-3.1 5.4-2.4 2.2 0 2.2Z"
          />
          <path className="lamp-pull-crease" d="M-2.2 4.6C-0.8 5.2 0.8 5.2 2.2 4.6" />
        </g>
      </svg>
      <button
        ref={switchRef}
        type="button"
        className="lamp-switch"
        style={lampSwitchStyle}
        aria-label={lit ? 'Turn the lamp off (dark mode)' : 'Turn the lamp on (light mode)'}
      />
      <span ref={zoneRef} className="lamp-cord-zone" style={cordZoneStyle} aria-hidden="true" />
    </div>
  );
}
