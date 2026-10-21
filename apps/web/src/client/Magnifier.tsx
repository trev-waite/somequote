import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { DeskPart } from './DeskPart';
import { overlay, VIEW_BOX } from './desk-geometry';
import type { Point } from './iso';
import {
  clampLens,
  GRIP,
  HOVER_LENS,
  MAGNIFIER,
  type MagnifierDrawing,
  magnifierDrawingAt,
  magnifierFrameAt,
} from './magnifier-geometry';
import type { Motion } from './reveal';

/** Movement beyond this many CSS pixels turns a press on the glass into a drag. */
const DRAG_SLOP_PX = 4;
const SCROLL_SLOP = 4;
/** Each arrow key press moves a held glass this far, in drawing units; with Shift, three times. */
const KEY_STEP = 5;

interface Hold {
  readonly held: boolean;
  /** How far up the glass was when it was last told to move. */
  readonly from: number;
  readonly elapsed: number;
  /** Where the lens's centre is held, in drawing units. */
  readonly lens: Point;
}

const durationOf = (held: boolean, from: number) =>
  (held ? MAGNIFIER.liftMs : MAGNIFIER.dropMs) * Math.abs((held ? 1 : 0) - from);

function liftOf({ held, from, elapsed }: Hold): number {
  const to = held ? 1 : 0;
  const duration = durationOf(held, from);
  if (duration === 0) return to;
  return from + (to - from) * Math.min(1, elapsed / duration);
}

function Glass({
  drawing,
  lift,
  lifted,
}: {
  drawing: MagnifierDrawing;
  lift: number;
  lifted: boolean;
}) {
  const { lens } = drawing;
  const zoom = `translate(${lens.center.x} ${lens.center.y}) scale(${lens.magnification}) translate(${-lens.center.x} ${-lens.center.y})`;
  return (
    <g className="magnifier" data-held={lifted ? '' : undefined}>
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
      <clipPath id="magnifier-near">
        <path d={lens.near} />
      </clipPath>
      <clipPath id="magnifier-far">
        <path d={lens.far} />
      </clipPath>
      <path className="magnifier-wall" d={lens.near} />
      <g clipPath="url(#magnifier-near)">
        <g clipPath="url(#magnifier-far)">
          {/* Redrawing the scene costs as much as drawing it, so only a raised glass shows it. */}
          {lifted && (
            <>
              <rect
                className="magnifier-backdrop"
                x={VIEW_BOX.x - VIEW_BOX.width}
                y={VIEW_BOX.y - VIEW_BOX.height}
                width={VIEW_BOX.width * 3}
                height={VIEW_BOX.height * 3}
              />
              <g className="magnifier-view" transform={zoom}>
                <use href="#desk-scene" />
                <use href="#envelope-scene" />
              </g>
            </>
          )}
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
    </g>
  );
}

interface MagnifierProps {
  readonly motion: Motion;
  readonly controls: RefObject<HTMLDivElement | null>;
  /** Where the glass draws while it lies on the desk: outside the scene its lens shows. */
  readonly rest: RefObject<SVGGElement | null>;
}

/**
 * A magnifying glass lying on the desk. Press and drag it to lift it by the handle and look at the
 * desk through it; let go and it stays held where it is. A tap on the held glass, Escape, or
 * scrolling away puts it back down. Its lens shows the live drawing, magnified.
 */
export function Magnifier({ motion, controls, rest }: MagnifierProps) {
  const [hold, setHold] = useState<Hold>({ held: false, from: 0, elapsed: 0, lens: HOVER_LENS });
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [restLayer, setRestLayer] = useState<SVGGElement | null>(null);
  const layerRef = useRef<SVGSVGElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const press = useRef<{
    pointerId: number;
    x: number;
    y: number;
    offset: Point;
    wasHeld: boolean;
    moved: boolean;
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
        current.held === held && current.from === from ? { ...current, elapsed } : current,
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
          };
    });
  const moveToRef = useRef(moveTo);
  moveToRef.current = moveTo;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && heldRef.current) moveToRef.current(false);
    };
    const onScroll = () => {
      if (!heldRef.current || press.current) return;
      if (Math.abs(window.scrollY - scrollAtLift.current) > SCROLL_SLOP) moveToRef.current(false);
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const toDrawing = (event: ReactPointerEvent): Point | undefined => {
    const matrix = layerRef.current?.getScreenCTM?.()?.inverse();
    if (!matrix) return undefined;
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

  const drawing = useMemo(
    () => magnifierDrawingAt(magnifierFrameAt(lift, hold.lens), lift),
    [lift, hold.lens],
  );
  const lifted = lift > 0;
  const glass = <Glass drawing={drawing} lift={lift} lifted={lifted} />;

  return (
    <>
      <svg
        ref={layerRef}
        className="iso-svg magnifier-layer"
        viewBox={`${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.width} ${VIEW_BOX.height}`}
        aria-hidden="true"
        focusable="false"
      >
        {lifted && glass}
      </svg>
      {!lifted && restLayer && createPortal(glass, restLayer)}
      {host &&
        createPortal(
          <>
            <button
              ref={buttonRef}
              type="button"
              className="magnifier-grip"
              data-held={held ? '' : undefined}
              style={{ ...overlay(drawing.area.box), clipPath: drawing.area.clipPath }}
              aria-label={held ? 'Put down the magnifying glass' : 'Pick up the magnifying glass'}
              aria-pressed={held}
              onPointerDown={(event) => {
                if (event.button !== 0 || press.current) return;
                const point = toDrawing(event);
                if (!point) return;
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
                };
                if (!held)
                  moveTo(true, clampLens({ x: point.x + offset.x, y: point.y + offset.y }));
              }}
              onPointerMove={(event) => {
                const active = press.current;
                if (!active || active.pointerId !== event.pointerId) return;
                active.moved ||=
                  Math.hypot(event.clientX - active.x, event.clientY - active.y) > DRAG_SLOP_PX;
                const point = toDrawing(event);
                if (!point) return;
                moveTo(
                  true,
                  clampLens({ x: point.x + active.offset.x, y: point.y + active.offset.y }),
                );
              }}
              onPointerUp={letGo}
              onPointerCancel={letGo}
              onLostPointerCapture={letGo}
              onClick={(event) => {
                // Pointers pick up and put down on press and release; this is the keyboard's way.
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
}
