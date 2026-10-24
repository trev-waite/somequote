import { type CSSProperties, memo } from 'react';
import { DeskPart } from '../desk/DeskPart';
import { DIGIT_HALO, DIGITS } from './digit-geometry';
import {
  ATTRIBUTION,
  DIGIT_SWITCHES,
  FACE_PLANE,
  GROUND_PLANE,
  LETTER_SIZE,
  type Letter,
  SHOWN_AT,
  SWITCHING,
} from './quote-letters';
import { VIEW_BOX } from './scene-geometry';
import { SPYGLASS_HALO, type SpyglassPart, type spyglassDrawingAt } from './spyglass-geometry';

export type Phase = 'rest' | 'quote' | 'digits';

const viewBox = `${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.width} ${VIEW_BOX.height}`;
const FADE_MS = 300;

/** Plays forward toward the quote and backward toward the 404, so both directions match. */
function play(name: string, phase: Phase, delayMs: number, durationMs: number): CSSProperties {
  return {
    animationName: name,
    animationDelay: `${delayMs}ms`,
    animationDuration: `${durationMs}ms`,
    animationDirection: phase === 'quote' ? 'normal' : 'reverse',
  };
}

function Piece({ part }: { part: SpyglassPart }) {
  if (part.kind !== 'glass') return <DeskPart part={part} />;
  return (
    <>
      <path className="spyglass-glass" d={part.d} />
      {part.glints.map((d, index) => (
        <path key={d} className="spyglass-glint" data-index={index} d={d} />
      ))}
    </>
  );
}

interface SignProps {
  readonly phase: Phase;
  readonly letters: readonly Letter[] | null;
  readonly reduced: boolean;
}

/**
 * The 404 and the quote it turns into, which only redraw when the phase changes. Keys carry the
 * phase so each switch starts its animations afresh rather than reversing finished ones.
 */
const Sign = memo(function Sign({ phase, letters, reduced }: SignProps) {
  const switching = phase !== 'rest';
  const digitStyle = (index: number) => {
    if (!switching) return undefined;
    if (reduced) return play('fade-in', phase === 'quote' ? 'digits' : 'quote', 0, FADE_MS);
    const { toQuote, toDigits } = DIGIT_SWITCHES[index] ?? { toQuote: 0, toDigits: 0 };
    return play('digit-pop', phase, phase === 'quote' ? toQuote : toDigits, SWITCHING.digitMs);
  };
  const letterStyle = ({ toQuote, toDigits }: Letter) =>
    reduced
      ? play('fade-in', phase, 0, FADE_MS)
      : play('word-rise', phase, phase === 'quote' ? toQuote : toDigits, SWITCHING.letterMs);
  const sourceStyle = play(
    reduced ? 'fade-in' : 'blur-in',
    phase,
    reduced || phase === 'digits' ? 0 : SHOWN_AT,
    FADE_MS,
  );

  return (
    <svg className="iso-svg not-found-sign" viewBox={viewBox} aria-hidden="true" focusable="false">
      <defs>
        <filter id="not-found-halo" x="-20%" y="-60%" width="140%" height="220%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      <path className="iso-halo" d={DIGIT_HALO} filter="url(#not-found-halo)" />
      {DIGITS.map((digit, index) => (
        <g key={`${phase} ${digit.face}`} className="not-found-digit" style={digitStyle(index)}>
          {digit.walls.map((wall) => (
            <g key={wall.d}>
              <path className="iso-shade" data-shade={wall.shade} d={wall.d} />
              <path className="iso-line" data-tone="mid" d={wall.edges} />
            </g>
          ))}
          <path className="iso-top" d={digit.face} />
          <path className="iso-line" data-tone="faint" d={digit.crease} />
          <path className="iso-line" data-tone="mid" d={digit.outline} />
        </g>
      ))}
      {switching && letters && (
        <>
          <g transform={FACE_PLANE}>
            {letters.map((letter) => (
              <text
                key={`${phase} ${letter.x} ${letter.y}`}
                className="quote-letter"
                x={letter.x}
                y={letter.y}
                fontSize={LETTER_SIZE}
                style={letterStyle(letter)}
              >
                {letter.char}
              </text>
            ))}
          </g>
          <g transform={GROUND_PLANE}>
            <text key={phase} className="quote-source" fontSize={7} style={sourceStyle}>
              {ATTRIBUTION}
            </text>
          </g>
        </>
      )}
    </svg>
  );
});

type SceneProps = SignProps & ReturnType<typeof spyglassDrawingAt>;

export function NotFoundScene({ phase, letters, reduced, parts, shadow }: SceneProps) {
  return (
    <>
      <Sign phase={phase} letters={letters} reduced={reduced} />
      <svg
        className="iso-svg spyglass-layer"
        viewBox={viewBox}
        aria-hidden="true"
        focusable="false"
      >
        <g opacity={shadow}>
          <path className="iso-halo" d={SPYGLASS_HALO} filter="url(#not-found-halo)" />
        </g>
        <g className="not-found-spyglass">
          {parts.map((part, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the parts are a painter's order
            <Piece key={index} part={part} />
          ))}
        </g>
      </svg>
    </>
  );
}
