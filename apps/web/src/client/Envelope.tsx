import { type CSSProperties, useEffect, useRef, useState } from 'react';
import type { QuoteDto } from '../shared/api-contract';
import { LAMP_LIGHT, overlay, VIEW_BOX } from './desk-geometry';
import {
  airplaneFaces,
  FLIGHT_DURATION,
  type FlightStage,
  flightDrawingAt,
  NEXT_FLIGHT_STAGE,
} from './envelope-flight';
import {
  AIRPLANE_BOX,
  drawingAt,
  ENVELOPE,
  LETTER_AIRPLANE,
  LETTER_PULL_BOX,
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
import { useLetterPull } from './use-letter-pull';

const { width: W, height: H, flap: F } = ENVELOPE;
const R = 0.8;
const BODY = `M${R} 0H${W - R}Q${W} 0 ${W} ${R}V${H - R}Q${W} ${H} ${W - R} ${H}H${R}Q0 ${H} 0 ${H - R}V${R}Q0 0 ${R} 0Z`;
const SEAM = { left: [W * 0.38, H * 0.6], right: [W * 0.62, H * 0.6] } as const;
const SEAMS = [
  `M0.5 0.5L${SEAM.left[0]} ${SEAM.left[1]}M${W - 0.5} 0.5L${SEAM.right[0]} ${SEAM.right[1]}`,
  `M0.7 ${H - 0.5}L${SEAM.left[0]} ${SEAM.left[1]}Q${W / 2} ${H * 0.5} ${SEAM.right[0]} ${SEAM.right[1]}L${W - 0.7} ${H - 0.5}`,
].join('');
const FLAP = `M0 0L${W * 0.42} ${F * 0.84}Q${W / 2} ${F} ${W * 0.58} ${F * 0.84}L${W} 0Z`;
const LETTER_EDGE = `M0 0.5V${ENVELOPE.letter.height - 0.5}q0 0.5 0.5 0.5h${LETTER_WIDTH - 1}q0.5 0 0.5 -0.5V0.5`;
const WRITING_SIZE = 3.4;
/** The shadow the lifted envelope casts on the desk behind it, in viewBox units. */
const SHADOW = { opacity: 0.3, drop: 6 } as const;

const restingStyle = overlay(RESTING_BOX);
const liftedStyle = overlay(LIFTED_BOX);
/** The options sit inside the lifted letter's own overlay. */
const optionStyles = OPTION_BOXES.map((box) => overlay(box, LIFTED_BOX));
const pullStyle = overlay(LETTER_PULL_BOX, LIFTED_BOX);
const airplaneStyle = overlay(AIRPLANE_BOX, LIFTED_BOX);

interface Flight {
  readonly stage: FlightStage;
  readonly elapsed: number;
  readonly exitX: number;
  readonly letter: number;
}

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
  const copyTimer = useRef(0);
  const [raised, setRaised] = useState(false);
  const [flight, setFlight] = useState<Flight | null>(null);
  const flightRef = useRef(flight);
  flightRef.current = flight;
  const pull = useLetterPull(motion, phase === 'shown' && !flight, (offset) => {
    setCopy('idle');
    turnTo('returning', offset);
    triggerRef.current?.focus({ preventScroll: true });
  });
  const layerRef = useRef<SVGSVGElement>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const firstOptionRef = useRef<HTMLButtonElement>(null);
  const scrollAtLift = useRef(0);

  /** Starts `move` from wherever the envelope has got to. */
  const turnTo = (move: 'lifting' | 'returning', letterOffset = pull.offset) =>
    setClock(({ phase, elapsed, from }) => {
      const pose = poseAt(phase, elapsed, from).pose;
      return {
        phase: move,
        elapsed: 0,
        from: {
          ...pose,
          letter: pose.letter + (phase === 'shown' ? letterOffset / ENVELOPE.letter.travel : 0),
        },
      };
    });
  const turnToRef = useRef(turnTo);
  turnToRef.current = turnTo;

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const flightStage = flight?.stage;
  useEffect(() => {
    if (!flightStage) return;
    const next = NEXT_FLIGHT_STAGE[flightStage];
    const advance = () =>
      setFlight((current) => {
        if (!current || current.stage !== flightStage) return current;
        return next ? { ...current, stage: next, elapsed: 0 } : null;
      });
    if (flightStage === 'away') {
      const timer = window.setTimeout(advance, FLIGHT_DURATION.away);
      return () => window.clearTimeout(timer);
    }
    if (motion === 'reduced') {
      advance();
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      if (elapsed >= FLIGHT_DURATION[flightStage]) {
        advance();
        return;
      }
      setFlight((current) => (current?.stage === flightStage ? { ...current, elapsed } : current));
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [flightStage, motion]);

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
      if (flightRef.current) {
        if (Math.abs(window.scrollY - scrollAtLift.current) <= SCROLL_SLOP) return;
        setFlight(null);
        setClock({ phase: 'open', elapsed: 0 });
        return;
      }
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

  const flightDrawing = flight
    ? flightDrawingAt(flight.stage, flight.elapsed, flight.exitX, flight.letter)
    : null;
  const planeFaces = flightDrawing?.plane ? airplaneFaces(flightDrawing) : [];
  const pose = flightDrawing?.pose ?? poseAt(phase, elapsed, from).pose;
  const onDesk = !flight && (phase === 'open' || phase === 'opening');
  const drawing = drawingAt(
    {
      ...pose,
      letter: pose.letter + (phase === 'shown' ? pull.offset / ENVELOPE.letter.travel : 0),
    },
    flightDrawing?.frame,
  );
  const content = shareContent(window.location.origin, quote);
  const native = canShareNatively();
  const copyLabel = { idle: 'Copy link', copied: 'Link copied', failed: 'Couldn’t copy' }[copy];
  const labels = [copyLabel, 'Post on X', native ? 'More ways to share' : 'Send by email'];
  const opening = ENVELOPE.lifted.y - (H * ENVELOPE.lifted.scale) / 2;
  const optionsVisible =
    (opening - LIFTED_BOX.y + pull.offset * ENVELOPE.lifted.scale) / LIFTED_BOX.height;

  const copyLink = () => {
    const report = (result: CopyState) => {
      setCopy(result);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopy('idle'), 5000);
    };
    // Browsers leave the clipboard out of insecure contexts.
    const clipboard: Clipboard | undefined = navigator.clipboard;
    if (!clipboard) {
      report('failed');
      return;
    }
    clipboard.writeText(content.url).then(
      () => report('copied'),
      () => report('failed'),
    );
  };
  const shareNatively = () => {
    navigator.share({ title: 'SomeQuote', ...content }).catch(() => undefined);
  };

  const fly = () => {
    const rect = layerRef.current?.getBoundingClientRect();
    const scale = rect?.width ? rect.width / VIEW_BOX.width : 1;
    const exitX = VIEW_BOX.x - (rect?.left ?? 0) / scale - 80;
    setCopy('idle');
    const letter = 1 + pull.offset / ENVELOPE.letter.travel;
    pull.reset();
    setClock({ phase: 'open', elapsed: 0 });
    scrollAtLift.current = window.scrollY;
    setFlight({ stage: 'folding', elapsed: 0, exitX, letter });
    triggerRef.current?.focus({ preventScroll: true });
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
        ref={layerRef}
        className="iso-svg envelope-layer"
        viewBox={`${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.width} ${VIEW_BOX.height}`}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <clipPath id="envelope-letter-window">
            <rect width={LETTER_WIDTH} height={drawing.letterHeight} />
          </clipPath>
          <clipPath id="envelope-paper">
            <path transform={drawing.body} d={BODY} />
            <path transform={drawing.flap} d={FLAP} />
            <rect transform={drawing.letter} width={LETTER_WIDTH} height={drawing.letterHeight} />
          </clipPath>
        </defs>
        <g
          id="envelope-scene"
          className="envelope"
          data-flight={flight?.stage}
          visibility={flight?.stage === 'away' ? 'hidden' : undefined}
          data-raised={raised && onDesk ? '' : undefined}
        >
          {!flight && pose.lift > 0 && (
            <g
              className="envelope-shadow"
              filter="url(#desk-halo)"
              opacity={SHADOW.opacity * pose.lift}
              transform={`translate(0 ${SHADOW.drop * pose.lift})`}
            >
              <path transform={drawing.body} d={BODY} />
              <rect transform={drawing.letter} width={LETTER_WIDTH} height={drawing.letterHeight} />
            </g>
          )}
          {planeFaces.length > 0 && (
            <g
              className="envelope-shadow"
              opacity={0.1 * (flightDrawing?.fold ?? 0)}
              clipPath="url(#desk-top)"
            >
              {planeFaces.map(({ index, shadow }) => (
                <path key={index} d={shadow} />
              ))}
            </g>
          )}
          <g opacity={1 - (flightDrawing?.fold ?? 0)}>
            {!drawing.flapOver && flap}
            <g transform={drawing.letter} clipPath="url(#envelope-letter-window)">
              <rect
                className="envelope-letter"
                width={LETTER_WIDTH}
                height={ENVELOPE.letter.height}
                rx="0.5"
              />
              <path className="envelope-letter-outline" d={LETTER_EDGE} />
              <path className="envelope-pull-mark" d={`M${LETTER_WIDTH / 2 - 2} 4.8h4`} />
              <g
                className="envelope-airplane-icon"
                transform={`translate(${LETTER_WIDTH / 2 - 3.5} ${LETTER_AIRPLANE.top + (LETTER_AIRPLANE.height - 6.8) / 2})`}
              >
                <path d="M0 3.3L7 0L4.8 6.8L3 4.5L0 3.3ZM3 4.5L7 0M3 4.5L2.8 6.3L4 5.8" />
              </g>
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
            <g transform={drawing.body} visibility={flightDrawing?.plane ? 'hidden' : undefined}>
              <path className="envelope-paper" d={BODY} />
              <path className="envelope-seam" d={SEAMS} />
            </g>
            {drawing.flapOver && flap}
          </g>
          {flightDrawing?.plane && (
            <g
              className="paper-airplane"
              style={{ '--crease': Math.min(1, flightDrawing.fold * 4) } as CSSProperties}
            >
              {planeFaces.map(({ index, d, shade }) => (
                <path key={index} d={d} style={{ '--shade': shade } as CSSProperties} />
              ))}
            </g>
          )}
          {pose.lift < 1 && (!flight || flight.stage === 'landing') && (
            <ellipse
              className="lamp-light lamp-pool envelope-light"
              cx={LAMP_LIGHT.pool.cx + (flightDrawing?.lightOffset?.x ?? 0)}
              cy={LAMP_LIGHT.pool.cy + (flightDrawing?.lightOffset?.y ?? 0)}
              rx={LAMP_LIGHT.pool.rx}
              ry={LAMP_LIGHT.pool.ry}
              fill="url(#lamp-pool)"
              clipPath="url(#envelope-paper)"
              opacity={(1 - pose.lift) * (flightDrawing?.lightOpacity ?? 1)}
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
          {...pull.handlers}
        >
          <button
            type="button"
            className="envelope-pull"
            style={{
              ...pullStyle,
              transform: `translateY(${(-pull.offset / LETTER_PULL_BOX.height) * 100 * ENVELOPE.lifted.scale}%)`,
            }}
            aria-label={
              pull.expanded
                ? 'Push letter back into envelope'
                : 'Pull letter up to reveal a paper airplane'
            }
            aria-expanded={pull.expanded}
            onClick={pull.toggle}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
              event.preventDefault();
              if (event.key === 'ArrowUp') pull.reveal();
              else pull.tuck();
            }}
          />
          <div
            className="envelope-options"
            style={{
              transform: `translateY(${(-pull.offset / LIFTED_BOX.height) * 100 * ENVELOPE.lifted.scale}%)`,
              clipPath: `inset(0 0 ${Math.max(0, (1 - optionsVisible) * 100)}% 0)`,
            }}
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
            {pull.expanded && (
              <button
                type="button"
                className="envelope-flight-trigger"
                style={airplaneStyle}
                aria-label="Fly paper airplane"
                onClick={fly}
              />
            )}
          </div>
          <p className="visually-hidden" role="status">
            {copy === 'idle' ? '' : copyLabel}
          </p>
        </section>
      )}
      <p className="visually-hidden" role="status">
        {flight ? 'The paper airplane is flying. It will return to the desk.' : ''}
      </p>
    </>
  );
}
