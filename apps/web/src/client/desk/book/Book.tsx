import { memo, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Motion } from '../../publication/reveal';
import { DeskPart } from '../DeskPart';
import { overlay } from '../desk-geometry';
import {
  BACK_COVER,
  BOOK,
  BOOK_MIDDLE,
  type BookDirection,
  bookDrawingAt,
  FRONT_COVER,
  nextBookPosition,
} from './book-geometry';

interface BookState {
  readonly position: number;
  readonly turn?: { readonly to: number; readonly elapsed: number };
}

interface BookProps {
  readonly motion: Motion;
  readonly controls: RefObject<HTMLDivElement | null>;
  readonly above: RefObject<SVGGElement | null>;
}

export const Book = memo(function Book({ motion, controls, above }: BookProps) {
  const [state, setState] = useState<BookState>({ position: BOOK_MIDDLE });
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [layer, setLayer] = useState<SVGGElement | null>(null);
  const previousRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => setHost(controls.current), [controls]);
  useEffect(() => setLayer(above.current), [above]);
  const destination = state.turn?.to;

  useEffect(() => {
    if (destination === undefined) return;
    if (motion === 'reduced') {
      setState({ position: destination });
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      if (elapsed >= BOOK.turnMs) {
        setState({ position: destination });
        return;
      }
      setState((current) =>
        current.turn?.to === destination
          ? { ...current, turn: { to: destination, elapsed } }
          : current,
      );
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [destination, motion]);

  const drawing = useMemo(
    () => bookDrawingAt(state.position, state.turn?.to, (state.turn?.elapsed ?? 0) / BOOK.turnMs),
    [state],
  );
  const busy = !!state.turn;
  const front = state.position === FRONT_COVER;
  const back = state.position === BACK_COVER;
  useEffect(() => {
    if (front && document.activeElement === previousRef.current) {
      nextRef.current?.focus({ preventScroll: true });
    } else if (back && document.activeElement === nextRef.current) {
      previousRef.current?.focus({ preventScroll: true });
    }
  }, [front, back]);
  const turn = (direction: BookDirection) =>
    setState((current) => {
      if (current.turn) return current;
      const to = nextBookPosition(current.position, direction);
      return to === current.position ? current : { ...current, turn: { to, elapsed: 0 } };
    });
  const titleVisible = drawing.cover.some((part) => part.kind === 'writing');
  const status =
    front || back
      ? `${BOOK.title}, ${front ? 'front' : 'back'} cover.`
      : state.position === 0
        ? 'At the beginning of the book.'
        : state.position === BOOK.leaves
          ? 'At the end of the book.'
          : `Pages ${state.position * 2} and ${state.position * 2 + 1} of ${BOOK.leaves * 2}.`;

  return (
    <>
      <g
        className="book"
        data-position={state.position}
        data-turning={busy ? '' : undefined}
        data-left-height={drawing.leftHeight}
        data-right-height={drawing.rightHeight}
      >
        {drawing.parts.map((part, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the geometry returns a fixed painter's order
          <DeskPart key={index} part={part} />
        ))}
      </g>
      {layer &&
        createPortal(
          <g className="book-lifted">
            {drawing.sheet && (
              <g className="book-turning-sheet">
                {drawing.sheet.panels.map((part, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: the mesh has fixed panel indices
                  <DeskPart key={index} part={part} />
                ))}
                <path className="iso-line" data-tone="mid" d={drawing.sheet.outline} />
                <path className="iso-line" data-tone="lo" d={drawing.sheet.writing} />
              </g>
            )}
            <g className="book-cover" data-title-visible={titleVisible ? '' : undefined}>
              {drawing.cover.map((part, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: the cover has fixed solid and title layers
                <DeskPart key={index} part={part} />
              ))}
            </g>
          </g>,
          layer,
        )}
      {host &&
        createPortal(
          <fieldset className="book-controls" aria-label="Book">
            <button
              ref={previousRef}
              type="button"
              className="book-page-control book-previous"
              aria-label={
                back
                  ? `Open ${BOOK.title}`
                  : state.position === 0
                    ? 'Close front cover'
                    : 'Turn to previous page'
              }
              aria-disabled={busy || front}
              tabIndex={front ? -1 : 0}
              style={{ ...overlay(drawing.previous.box), clipPath: drawing.previous.clipPath }}
              onClick={() => turn('previous')}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                turn(event.key === 'ArrowLeft' ? 'previous' : 'next');
              }}
            />
            <button
              ref={nextRef}
              type="button"
              className="book-page-control book-next"
              aria-label={
                front
                  ? `Open ${BOOK.title}`
                  : state.position === BOOK.leaves
                    ? 'Close back cover'
                    : 'Turn to next page'
              }
              aria-disabled={busy || back}
              tabIndex={back ? -1 : 0}
              style={{ ...overlay(drawing.next.box), clipPath: drawing.next.clipPath }}
              onClick={() => turn('next')}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                turn(event.key === 'ArrowLeft' ? 'previous' : 'next');
              }}
            />
            <p className="visually-hidden" role="status">
              {status}
            </p>
          </fieldset>,
          host,
        )}
    </>
  );
});
