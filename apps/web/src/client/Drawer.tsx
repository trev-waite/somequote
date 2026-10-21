import { type RefObject, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { DeskPart } from './DeskPart';
import { overlay } from './desk-geometry';
import { DRAWER, drawerDrawingAt } from './drawer-geometry';
import type { Motion } from './reveal';

interface Slide {
  readonly open: boolean;
  readonly from: number;
  readonly elapsed: number;
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => t * t * (3 - 2 * t);
const durationOf = (open: boolean, from: number) =>
  (open ? DRAWER.openMs : DRAWER.closeMs) * Math.abs((open ? 1 : 0) - from);

function opennessOf({ open, from, elapsed }: Slide): number {
  const to = open ? 1 : 0;
  const duration = durationOf(open, from);
  if (duration === 0) return to;
  const ease = open ? easeOut : easeInOut;
  return from + (to - from) * ease(Math.min(1, elapsed / duration));
}

interface DrawerProps {
  readonly motion: Motion;
  readonly controls: RefObject<HTMLDivElement | null>;
}

export function Drawer({ motion, controls }: DrawerProps) {
  const [slide, setSlide] = useState<Slide>({ open: false, from: 0, elapsed: 0 });
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  useEffect(() => setHost(controls.current), [controls]);
  const openness = opennessOf(slide);
  const moving = openness !== (slide.open ? 1 : 0);

  const { open, from } = slide;
  useEffect(() => {
    const duration = durationOf(open, from);
    if (motion === 'reduced' || duration === 0) return;
    let frame = 0;
    let start: number | undefined;
    const step = (now: number) => {
      start ??= now;
      const elapsed = Math.min(duration, now - start);
      setSlide((current) =>
        current.open === open && current.from === from ? { ...current, elapsed } : current,
      );
      if (elapsed < duration) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [open, from, motion]);

  const drawing = useMemo(() => drawerDrawingAt(openness), [openness]);
  const toggle = () =>
    setSlide((current) => ({
      open: !current.open,
      from: motion === 'reduced' ? (current.open ? 0 : 1) : opennessOf(current),
      elapsed: 0,
    }));

  return (
    <>
      <g className="drawer" data-open={open ? '' : undefined} data-moving={moving ? '' : undefined}>
        {drawing.hollow && <path className="drawer-hollow" d={drawing.hollow} />}
        {drawing.back.map((part, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the geometry returns a fixed painter's order
          <DeskPart key={index} part={part} />
        ))}
        {drawing.floor && <path className="drawer-floor" d={drawing.floor} />}
        {drawing.letter && (
          <g className="drawer-letter">
            <clipPath id="drawer-letter-sheet">
              <path d={drawing.letter.sheet} />
            </clipPath>
            <g clipPath="url(#drawer-letter-sheet)">
              {drawing.letter.parts.map((part, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: the letter has fixed layers
                <DeskPart key={index} part={part} />
              ))}
            </g>
          </g>
        )}
        {drawing.front.map((part, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the geometry returns a fixed painter's order
          <DeskPart key={index} part={part} />
        ))}
      </g>
      {host &&
        createPortal(
          <>
            <button
              type="button"
              className="drawer-handle"
              style={{ ...overlay(drawing.area.box), clipPath: drawing.area.clipPath }}
              aria-label={open ? 'Close the desk drawer' : 'Open the desk drawer'}
              aria-expanded={open}
              onClick={toggle}
            />
            <p className="visually-hidden" role="status">
              {open ? `In the drawer is a letter: ${DRAWER.letter.text}.` : ''}
            </p>
          </>,
          host,
        )}
    </>
  );
}
