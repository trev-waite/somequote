import { useEffect, useRef, useState } from 'react';
import type { QuoteDto } from '../shared/api-contract';
import { LAMP_LIGHT, overlay, VIEW_BOX } from './desk-geometry';
import {
  drawingAt,
  ENVELOPE,
  LETTER_ROWS,
  LETTER_WIDTH,
  LIFTED_BOX,
  OPTION_BOXES,
  type Phase,
  type Pose,
  poseAt,
  RESTING_BOX,
} from './envelope-pose';
import type { Motion } from './reveal';
import { canShareNatively, emailUrl, postOnXUrl, shareContent } from './share';

const { width: W, height: H, flap: F } = ENVELOPE;
const R = 0.8;
const BODY = `M${R} 0H${W - R}Q${W} 0 ${W} ${R}V${H - R}Q${W} ${H} ${W - R} ${H}H${R}Q0 ${H} 0 ${H - R}V${R}Q0 0 ${R} 0Z`;
const SEAM = { left: [W * 0.38, H * 0.6], right: [W * 0.62, H * 0.6] } as const;
const SEAMS = [
  `M0.5 0.5L${SEAM.left[0]} ${SEAM.left[1]}M${W - 0.5} 0.5L${SEAM.right[0]} ${SEAM.right[1]}`,
  `M0.7 ${H - 0.5}L${SEAM.left[0]} ${SEAM.left[1]}Q${W / 2} ${H * 0.5} ${SEAM.right[0]} ${SEAM.right[1]}L${W - 0.7} ${H - 0.5}`,
].join('');
const FLAP = `M0 0L${W * 0.42} ${F * 0.84}Q${W / 2} ${F} ${W * 0.58} ${F * 0.84}L${W} 0Z`;
const WRITING_SIZE = 3.4;
/** The shadow the lifted envelope casts on the desk behind it, in viewBox units. */
const SHADOW = { opacity: 0.3, drop: 6 } as const;

const restingStyle = overlay(RESTING_BOX);
const liftedStyle = overlay(LIFTED_BOX);
/** The options sit inside the lifted letter's own overlay. */
const optionStyles = OPTION_BOXES.map((box) => overlay(box, LIFTED_BOX));

type CopyState = 'idle' | 'copied' | 'failed';

interface Clock {
  readonly phase: Phase;
  readonly elapsed: number;
  /** Where the current move started, when it took over from another part way through. */
  readonly from?: Pose;
}

/** Scrolling further than this, in CSS pixels, while the letter is out puts it away. */
const SCROLL_SLOP = 4;

interface EnvelopeProps {
  readonly motion: Motion;
  readonly quote: QuoteDto | undefined;
}

/**
 * An open envelope on the desk. Clicking it lifts it off the desk to face the reader with a letter
 * of share options. Clicking anywhere else, Escape, or scrolling folds it shut and puts it back on
 * the desk, where it opens again at once.
 */
export function Envelope({ motion, quote }: EnvelopeProps) {
  const [{ phase, elapsed, from }, setClock] = useState<Clock>({ phase: 'open', elapsed: 0 });
  const [copy, setCopy] = useState<CopyState>('idle');
  const [raised, setRaised] = useState(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const firstOptionRef = useRef<HTMLButtonElement>(null);
  const scrollAtLift = useRef(0);

  /** Starts `move` from wherever the envelope has got to. */
  const turnTo = (move: 'lifting' | 'returning') =>
    setClock(({ phase, elapsed, from }) => ({
      phase: move,
      elapsed: 0,
      from: poseAt(phase, elapsed, from).pose,
    }));
  const turnToRef = useRef(turnTo);
  turnToRef.current = turnTo;

  useEffect(() => {
    switch (phase) {
      case 'open':
        return;
      case 'shown':
        firstOptionRef.current?.focus({ preventScroll: true });
        return;
      case 'lifting':
      case 'returning':
      case 'opening': {
        if (motion === 'reduced') {
          const { next } = poseAt(phase, Number.POSITIVE_INFINITY);
          if (next) setClock({ phase: next, elapsed: 0 });
          return;
        }
        let frame = 0;
        let start: number | undefined;
        const step = (now: number) => {
          start ??= now;
          const elapsed = now - start;
          setClock((clock) => {
            if (clock.phase !== phase) return clock;
            const { next } = poseAt(phase, elapsed, clock.from);
            return next ? { phase: next, elapsed: 0 } : { ...clock, elapsed };
          });
          frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame);
      }
    }
  }, [phase, motion]);

  useEffect(() => {
    const outside = (event: Event) =>
      phaseRef.current === 'shown' &&
      !(event.target instanceof Node && cardRef.current?.contains(event.target));
    const putAway = () => {
      setCopy('idle');
      turnToRef.current('returning');
    };
    // While the letter is out, a press elsewhere only puts it away: the lamp and its cord ignore it.
    const onPress = (event: PointerEvent) => {
      if (outside(event)) event.stopPropagation();
    };
    const onClick = (event: MouseEvent) => {
      if (!outside(event)) return;
      event.stopPropagation();
      event.preventDefault();
      putAway();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || phaseRef.current !== 'shown') return;
      putAway();
      triggerRef.current?.focus();
    };
    const onScroll = () => {
      const phase = phaseRef.current;
      if (phase !== 'lifting' && phase !== 'shown') return;
      if (Math.abs(window.scrollY - scrollAtLift.current) <= SCROLL_SLOP) return;
      if (cardRef.current?.contains(document.activeElement)) {
        triggerRef.current?.focus({ preventScroll: true });
      }
      putAway();
    };
    document.addEventListener('pointerdown', onPress, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', onPress, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const { pose } = poseAt(phase, elapsed, from);
  const onDesk = phase === 'open' || phase === 'opening';
  const drawing = drawingAt(pose);
  const content = shareContent(window.location.origin, quote);
  const native = canShareNatively();
  const copyLabel = { idle: 'Copy link', copied: 'Link copied', failed: 'Couldn’t copy' }[copy];
  const labels = [copyLabel, 'Post on X', native ? 'More ways to share' : 'Send by email'];

  const copyLink = () => {
    // Browsers leave the clipboard out of insecure contexts.
    const clipboard: Clipboard | undefined = navigator.clipboard;
    if (!clipboard) {
      setCopy('failed');
      return;
    }
    clipboard.writeText(content.url).then(
      () => setCopy('copied'),
      () => setCopy('failed'),
    );
  };
  const shareNatively = () => {
    navigator.share({ title: 'SomeQuote', ...content }).catch(() => undefined);
  };

  const flap = (
    <path
      className="envelope-flap"
      data-side={drawing.flapSide}
      transform={drawing.flap}
      d={FLAP}
    />
  );
  return (
    <>
      <svg
        className="iso-svg envelope-layer"
        viewBox={`${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.width} ${VIEW_BOX.height}`}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <clipPath id="envelope-paper">
            <path transform={drawing.body} d={BODY} />
            <path transform={drawing.flap} d={FLAP} />
            <rect transform={drawing.letter} width={LETTER_WIDTH} height={ENVELOPE.letter.height} />
          </clipPath>
        </defs>
        <g className="envelope" data-raised={raised && phase === 'open' ? '' : undefined}>
          {pose.lift > 0 && (
            <g
              className="envelope-shadow"
              filter="url(#desk-halo)"
              opacity={SHADOW.opacity * pose.lift}
              transform={`translate(0 ${SHADOW.drop * pose.lift})`}
            >
              <path transform={drawing.body} d={BODY} />
              <rect
                transform={drawing.letter}
                width={LETTER_WIDTH}
                height={ENVELOPE.letter.height}
              />
            </g>
          )}
          {!drawing.flapOver && flap}
          <g transform={drawing.letter}>
            <rect
              className="envelope-letter"
              width={LETTER_WIDTH}
              height={ENVELOPE.letter.height}
              rx="0.5"
            />
            {labels.map((label, row) => {
              const top = LETTER_ROWS.top + row * LETTER_ROWS.height;
              return (
                <g key={label}>
                  {row > 0 && (
                    <path className="envelope-rule" d={`M4 ${top}H${LETTER_WIDTH - 4}`} />
                  )}
                  <text
                    className="envelope-writing"
                    x={LETTER_WIDTH / 2}
                    y={top + LETTER_ROWS.height / 2 + WRITING_SIZE * 0.3}
                    fontSize={WRITING_SIZE}
                  >
                    {label}
                  </text>
                </g>
              );
            })}
          </g>
          <g transform={drawing.body}>
            <path className="envelope-paper" d={BODY} />
            <path className="envelope-seam" d={SEAMS} />
          </g>
          {drawing.flapOver && flap}
          {pose.lift < 1 && (
            <ellipse
              className="lamp-light lamp-pool"
              cx={LAMP_LIGHT.pool.cx}
              cy={LAMP_LIGHT.pool.cy}
              rx={LAMP_LIGHT.pool.rx}
              ry={LAMP_LIGHT.pool.ry}
              fill="url(#lamp-pool)"
              clipPath="url(#envelope-paper)"
              opacity={1 - pose.lift}
            />
          )}
        </g>
      </svg>
      <button
        ref={triggerRef}
        type="button"
        className="envelope-trigger"
        style={restingStyle}
        aria-label="Share SomeQuote"
        aria-expanded={phase === 'lifting' || phase === 'shown'}
        aria-disabled={!onDesk}
        onClick={() => {
          if (!onDesk) return;
          scrollAtLift.current = window.scrollY;
          turnTo('lifting');
        }}
        onPointerEnter={() => setRaised(true)}
        onPointerLeave={() => setRaised(false)}
      />
      {phase === 'shown' && (
        <section
          ref={cardRef}
          className="envelope-card"
          style={liftedStyle}
          aria-label="Share SomeQuote"
        >
          <button
            ref={firstOptionRef}
            type="button"
            className="envelope-option"
            style={optionStyles[0]}
            onClick={copyLink}
          >
            <span className="visually-hidden">{labels[0]}</span>
          </button>
          <a
            className="envelope-option"
            style={optionStyles[1]}
            href={postOnXUrl(content)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="visually-hidden">{labels[1]}</span>
          </a>
          {native ? (
            <button
              type="button"
              className="envelope-option"
              style={optionStyles[2]}
              onClick={shareNatively}
            >
              <span className="visually-hidden">{labels[2]}</span>
            </button>
          ) : (
            <a className="envelope-option" style={optionStyles[2]} href={emailUrl(content)}>
              <span className="visually-hidden">{labels[2]}</span>
            </a>
          )}
          <p className="visually-hidden" role="status">
            {copy === 'idle' ? '' : copyLabel}
          </p>
        </section>
      )}
    </>
  );
}
