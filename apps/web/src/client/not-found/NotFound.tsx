import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { usePrefersReducedMotion } from '../data/today';
import { overlay } from '../desk/desk-geometry';
import { Logo } from '../Logo';
import { NotFoundScene, type Phase } from './NotFoundScene';
import {
  ATTRIBUTION,
  BACK_AT,
  LETTER_SIZE,
  type Letter,
  layQuote,
  QUOTE_LINES,
  SWITCHING,
} from './quote-letters';
import { VIEW_BOX } from './scene-geometry';
import {
  LOOK_MS,
  RESTING,
  SPYGLASS_AREA,
  type SpyglassPose,
  spyglassAt,
  spyglassDrawingAt,
} from './spyglass-geometry';
import './not-found.css';

const REDUCED_FADE_MS = 400;

const artStyle = { '--art-aspect': VIEW_BOX.width / VIEW_BOX.height } as CSSProperties;
const triggerStyle = {
  ...overlay(SPYGLASS_AREA.box, VIEW_BOX),
  clipPath: SPYGLASS_AREA.clipPath,
};

/** Lays out the quote once its font has loaded, so each letter sits where the font puts it. */
function useQuoteLetters() {
  const [letters, setLetters] = useState<readonly Letter[] | null>(null);
  useEffect(() => {
    let active = true;
    const family = getComputedStyle(document.documentElement).getPropertyValue('--font-quote');
    const font = `${LETTER_SIZE}px ${family}`;
    document.fonts
      .load(font)
      .catch(() => [])
      .then(() => {
        const context = document.createElement('canvas').getContext('2d');
        if (!active || !context) return;
        context.font = font;
        setLetters(layQuote((text) => context.measureText(text).width));
      });
    return () => {
      active = false;
    };
  }, []);
  return letters;
}

interface Look {
  readonly phase: Exclude<Phase, 'rest'>;
  readonly pose: SpyglassPose;
}

function useLooking(reduced: boolean) {
  const [look, setLook] = useState<Look | null>(null);
  const looking = look !== null;

  useEffect(() => {
    if (!looking) return;
    if (reduced) {
      const back = window.setTimeout(
        () => setLook({ phase: 'digits', pose: RESTING }),
        SWITCHING.holdMs,
      );
      const done = window.setTimeout(() => setLook(null), SWITCHING.holdMs + REDUCED_FADE_MS);
      return () => {
        window.clearTimeout(back);
        window.clearTimeout(done);
      };
    }
    let frame = 0;
    let start: number | undefined;
    const step = (now: number) => {
      start ??= now;
      const ms = now - start;
      if (ms >= LOOK_MS) {
        setLook(null);
        return;
      }
      const phase = ms < BACK_AT ? 'quote' : 'digits';
      const pose = spyglassAt(ms);
      setLook((current) =>
        current?.phase === phase && current.pose === pose ? current : { phase, pose },
      );
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [looking, reduced]);

  const phase: Phase = look?.phase ?? 'rest';
  const pose = look?.pose ?? RESTING;
  const drawing = useMemo(() => spyglassDrawingAt(pose), [pose]);
  return {
    phase,
    drawing,
    look: () => setLook((current) => current ?? { phase: 'quote', pose: RESTING }),
  };
}

export function NotFound() {
  const reduced = usePrefersReducedMotion();
  const letters = useQuoteLetters();
  const { phase, drawing, look } = useLooking(reduced);
  const ready = letters !== null && phase === 'rest';

  return (
    <div className="not-found-page">
      <header className="page-header">
        <a className="brand" href="/" aria-label="SomeQuote home">
          <Logo />
        </a>
      </header>
      <main className="not-found-main">
        <h1 className="visually-hidden">404 — Page not found</h1>
        <a className="not-found-home" href="/">
          Back to today’s quote
        </a>
        <div className="not-found-art" style={artStyle}>
          <NotFoundScene phase={phase} letters={letters} reduced={reduced} {...drawing} />
          <button
            className="spyglass-trigger"
            type="button"
            style={triggerStyle}
            aria-label="Look through the spyglass"
            aria-disabled={!ready}
            onClick={() => {
              if (ready) look();
            }}
          />
          <p className="visually-hidden" role="status">
            {phase === 'rest' ? '' : 'The spyglass looks over the 404, and it becomes a quote.'}
          </p>
        </div>
        <figure className="visually-hidden">
          <blockquote>{QUOTE_LINES.join(' ')}</blockquote>
          <figcaption>{ATTRIBUTION}</figcaption>
        </figure>
      </main>
    </div>
  );
}
