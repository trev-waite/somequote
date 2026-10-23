import {
  memo,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { Motion } from '../../publication/reveal';
import { DeskPart } from '../DeskPart';
import { overlay, VIEW_BOX } from '../desk-geometry';
import type { Point } from '../iso';
import {
  clampLens,
  GRIP,
  HOVER_LENS,
  MAGNIFIER,
  type MagnifierDrawing,
  magnifierDrawingAt,
  magnifierFrameAt,
} from './magnifier-geometry';

// Separate <use> targets keep cord updates from rebuilding the entire magnified scene.
const MAGNIFIED_LAYERS = ['desk-body', 'desk-ship', 'desk-cord', 'desk-above'] as const;

const DRAG_SLOP_PX = 4;
const SCROLL_SLOP = 4;
const KEY_STEP = 5;

interface Hold {
  readonly held: boolean;
  readonly from: number;
  readonly elapsed: number;
  readonly lens: Point;
  readonly anchor: Point;
}

const durationOf = (held: boolean, from: number) =>
  (held ? MAGNIFIER.liftMs : MAGNIFIER.dropMs) * Math.abs((held ? 1 : 0) - from);

function liftOf({ held, from, elapsed }: Hold): number {
  const to = held ? 1 : 0;
  const duration = durationOf(held, from);
  if (duration === 0) return to;
  return from + (to - from) * Math.min(1, elapsed / duration);
}

const percent = (fraction: number) => `${(fraction * 100).toFixed(4)}%`;

const clipOver = (points: readonly Point[]) =>
  `polygon(${points
    .map(
      ({ x, y }) =>
        `${percent((x - VIEW_BOX.x) / VIEW_BOX.width)} ${percent((y - VIEW_BOX.y) / VIEW_BOX.height)}`,
    )
    .join(',')})`;

function GlassBack({ drawing, lift }: { drawing: MagnifierDrawing; lift: number }) {
  return (
    <>
      {drawing.shadow && (
        <path
          className="magnifier-shadow"
          d={drawing.shadow.d}
          transform={`translate(${5 * lift} ${11 * lift})`}
          opacity={drawing.shadow.opacity}
          filter="url(#desk-halo)"
        />
      )}
      {drawing.rim.map((part, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the rim is a fixed set of parts
        <DeskPart key={index} part={part} />
      ))}
      <path className="magnifier-wall" d={drawing.lens.near} />
    </>
  );
}

function GlassFront({ drawing }: { drawing: MagnifierDrawing }) {
  const { lens } = drawing;
  return (
    <>
      <clipPath id="magnifier-near">
        <path d={lens.near} />
      </clipPath>
      <clipPath id="magnifier-far">
        <path d={lens.far} />
      </clipPath>
      <g clipPath="url(#magnifier-near)">
        <g clipPath="url(#magnifier-far)">
          <path className="magnifier-glass" d={lens.near} />
        </g>
      </g>
      {drawing.glints.map((d, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the glints are a fixed set
        <path key={index} className="magnifier-glint" data-index={index} d={d} />
      ))}
      <path className="magnifier-lens-edge" d={lens.near} />
      {drawing.handle.map((part, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the handle is a fixed set of parts
        <DeskPart key={index} part={part} />
      ))}
    </>
  );
}

interface MagnifierProps {
  readonly motion: Motion;
  readonly controls: RefObject<HTMLDivElement | null>;
  readonly rest: RefObject<SVGGElement | null>;
}

export const Magnifier = memo(function Magnifier({ motion, controls, rest }: MagnifierProps) {
  const [hold, setHold] = useState<Hold>({
    held: false,
    from: 0,
    elapsed: 0,
    lens: HOVER_LENS,
    anchor: HOVER_LENS,
  });
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [restLayer, setRestLayer] = useState<SVGGElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const press = useRef<{
    pointerId: number;
    x: number;
    y: number;
    offset: Point;
    wasHeld: boolean;
    moved: boolean;
    /** From client pixels to drawing units, read once per press: reading it can force a layout. */
    toDrawing: DOMMatrix | undefined;
  } | null>(null);
  const heldRef = useRef(hold.held);
  heldRef.current = hold.held;
  const scrollAtLift = useRef(0);
  useEffect(() => setHost(controls.current), [controls]);
  useEffect(() => setRestLayer(rest.current), [rest]);

  const lift = liftOf(hold);
  const { held, from } = hold;
  useEffect(() => {
    const duration = durationOf(held, from);
    if (motion === 'reduced' || duration === 0) return;
    let frame = 0;
    let start: number | undefined;
    const step = (now: number) => {
      start ??= now;
      const elapsed = Math.min(duration, now - start);
      setHold((current) =>
        current.held === held && current.from === from
          ? { ...current, elapsed, anchor: elapsed < duration ? current.anchor : current.lens }
          : current,
      );
      if (elapsed < duration) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [held, from, motion]);

  const moveTo = (held: boolean, lens?: Point) =>
    setHold((current) => {
      if (held && !current.held) scrollAtLift.current = window.scrollY;
      return current.held === held
        ? { ...current, lens: lens ?? current.lens }
        : {
            held,
            from: motion === 'reduced' ? (held ? 1 : 0) : liftOf(current),
            elapsed: 0,
            lens: lens ?? current.lens,
            anchor: lens ?? current.lens,
          };
    });
  const moveToRef = useRef(moveTo);
  moveToRef.current = moveTo;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && heldRef.current) moveToRef.current(false);
    };
    const onScroll = () => {
      if (press.current) {
        press.current.toDrawing = undefined;
        return;
      }
      if (!heldRef.current) return;
      if (Math.abs(window.scrollY - scrollAtLift.current) > SCROLL_SLOP) moveToRef.current(false);
    };
    const outside = (event: Event) =>
      heldRef.current &&
      !(event.target instanceof Node && buttonRef.current?.contains(event.target));
    const onPress = (event: PointerEvent) => {
      if (outside(event)) event.stopPropagation();
    };
    const onClick = (event: MouseEvent) => {
      if (!outside(event)) return;
      event.stopPropagation();
      event.preventDefault();
      moveToRef.current(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPress, true);
    document.addEventListener('click', onClick, true);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPress, true);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const screenToDrawing = () => restLayer?.closest('svg')?.getScreenCTM?.()?.inverse();
  const toDrawing = (event: ReactPointerEvent, matrix: DOMMatrix): Point => {
    const { x, y } = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
    return { x, y };
  };
  const letGo = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = press.current;
    if (!active || active.pointerId !== event.pointerId) return;
    press.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (event.type === 'pointerup' && !active.moved && active.wasHeld) moveTo(false);
  };

  const settled = held && lift === 1;
  const drawnAt = settled ? hold.anchor : hold.lens;
  const shift = settled
    ? { x: hold.lens.x - hold.anchor.x, y: hold.lens.y - hold.anchor.y }
    : { x: 0, y: 0 };
  const drawing = useMemo(
    () => magnifierDrawingAt(magnifierFrameAt(lift, drawnAt), lift),
    [lift, drawnAt],
  );
  const back = useMemo(() => <GlassBack drawing={drawing} lift={lift} />, [drawing, lift]);
  const front = useMemo(() => <GlassFront drawing={drawing} />, [drawing]);
  const lifted = lift > 0;
  const lensOpacity = lift * lift * (3 - 2 * lift);

  const zoom = MAGNIFIER.held.magnification;
  const center = { x: drawing.lens.center.x + shift.x, y: drawing.lens.center.y + shift.y };
  const fraction = (point: Point) => ({
    x: (point.x - VIEW_BOX.x) / VIEW_BOX.width,
    y: (point.y - VIEW_BOX.y) / VIEW_BOX.height,
  });
  const moved = fraction({ x: VIEW_BOX.x + shift.x, y: VIEW_BOX.y + shift.y });
  const anchored = fraction(drawing.lens.center);
  const view = {
    x: (1 - zoom) * anchored.x - zoom * moved.x,
    y: (1 - zoom) * anchored.y - zoom * moved.y,
  };
  const viewStyle = {
    width: percent(zoom),
    height: percent(zoom),
    transform: `translate(${percent(view.x / zoom)}, ${percent(view.y / zoom)})`,
  };

  return (
    <>
      <div className="magnifier-layer">
        {lifted && (
          <div
            className="magnifier-held"
            style={{ transform: `translate(${percent(moved.x)}, ${percent(moved.y)})` }}
          >
            <svg
              className="iso-svg magnifier-part"
              viewBox={`${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.width} ${VIEW_BOX.height}`}
              aria-hidden="true"
              focusable="false"
            >
              <g className="magnifier" data-held="">
                {back}
              </g>
            </svg>
            <div
              className="magnifier-lens"
              style={{ clipPath: clipOver(drawing.lens.opening), opacity: lensOpacity }}
              data-center={`${center.x} ${center.y}`}
              data-magnification={zoom}
            >
              <svg
                className="iso-svg magnifier-view"
                viewBox={`${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.width} ${VIEW_BOX.height}`}
                style={viewStyle}
                aria-hidden="true"
                focusable="false"
              >
                {MAGNIFIED_LAYERS.map((id) => (
                  <use key={id} href={`#${id}`} />
                ))}
              </svg>
              <svg
                className="iso-svg magnifier-view"
                viewBox={`${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.width} ${VIEW_BOX.height}`}
                style={viewStyle}
                aria-hidden="true"
                focusable="false"
              >
                <use href="#desk-clock" />
                <use href="#envelope-scene" />
              </svg>
            </div>
            <svg
              className="iso-svg magnifier-part"
              viewBox={`${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.width} ${VIEW_BOX.height}`}
              aria-hidden="true"
              focusable="false"
            >
              <g className="magnifier" data-held="">
                {front}
              </g>
            </svg>
          </div>
        )}
      </div>
      {!lifted &&
        restLayer &&
        createPortal(
          <g className="magnifier">
            {back}
            {front}
          </g>,
          restLayer,
        )}
      {host &&
        createPortal(
          <>
            <button
              ref={buttonRef}
              type="button"
              className="magnifier-grip"
              data-held={held ? '' : undefined}
              style={{
                ...overlay(drawing.area.box),
                clipPath: drawing.area.clipPath,
                transform: `translate(${percent(shift.x / drawing.area.box.width)}, ${percent(shift.y / drawing.area.box.height)})`,
              }}
              aria-label={held ? 'Put down the magnifying glass' : 'Pick up the magnifying glass'}
              aria-pressed={held}
              onPointerDown={(event) => {
                if (event.button !== 0 || press.current) return;
                const matrix = screenToDrawing();
                if (!matrix) return;
                const point = toDrawing(event, matrix);
                event.preventDefault();
                event.currentTarget.setPointerCapture?.(event.pointerId);
                const offset = held
                  ? { x: hold.lens.x - point.x, y: hold.lens.y - point.y }
                  : { x: -GRIP.x, y: -GRIP.y };
                press.current = {
                  pointerId: event.pointerId,
                  x: event.clientX,
                  y: event.clientY,
                  offset,
                  wasHeld: held,
                  moved: false,
                  toDrawing: matrix,
                };
                if (!held)
                  moveTo(true, clampLens({ x: point.x + offset.x, y: point.y + offset.y }));
              }}
              onPointerMove={(event) => {
                const active = press.current;
                if (!active || active.pointerId !== event.pointerId) return;
                active.moved ||=
                  Math.hypot(event.clientX - active.x, event.clientY - active.y) > DRAG_SLOP_PX;
                active.toDrawing ??= screenToDrawing();
                if (!active.toDrawing) return;
                const point = toDrawing(event, active.toDrawing);
                moveTo(
                  true,
                  clampLens({ x: point.x + active.offset.x, y: point.y + active.offset.y }),
                );
              }}
              onPointerUp={letGo}
              onPointerCancel={letGo}
              onLostPointerCapture={letGo}
              onClick={(event) => {
                if (event.detail !== 0) return;
                if (held) moveTo(false);
                else moveTo(true, HOVER_LENS);
              }}
              onKeyDown={(event) => {
                if (!held) return;
                const step = KEY_STEP * (event.shiftKey ? 3 : 1);
                const move = {
                  ArrowLeft: { x: -step, y: 0 },
                  ArrowRight: { x: step, y: 0 },
                  ArrowUp: { x: 0, y: -step },
                  ArrowDown: { x: 0, y: step },
                }[event.key];
                if (!move) return;
                event.preventDefault();
                moveTo(true, clampLens({ x: hold.lens.x + move.x, y: hold.lens.y + move.y }));
              }}
            />
            <p className="visually-hidden" role="status">
              {held
                ? 'Magnifying glass raised. Drag it, or use the arrow keys, to look closer at the desk.'
                : ''}
            </p>
          </>,
          host,
        )}
    </>
  );
});
