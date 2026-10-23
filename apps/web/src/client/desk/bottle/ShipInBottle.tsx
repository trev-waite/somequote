import { memo, type RefObject, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Motion } from '../../publication/reveal';
import { DeskPart } from '../DeskPart';
import { overlay } from '../desk-geometry';
import {
  BOTTLE_AREA,
  BOTTLE_DURATION,
  type BottlePart,
  type BottleStage,
  bottleAt,
  bottleDrawingAt,
  NEXT_BOTTLE_STAGE,
} from './bottle-geometry';

function Piece({ part }: { part: BottlePart }) {
  switch (part.kind) {
    case 'sail':
      return <path className="ship-sail" d={part.d} />;
    case 'flag':
      return <path className="ship-flag" d={part.d} />;
    case 'sea':
      return <path className="ship-sea" d={part.d} />;
    case 'solid':
    case 'line':
      return <DeskPart part={part} />;
  }
}

function Pieces({ parts }: { parts: readonly BottlePart[] }) {
  return parts.map((part, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: the geometry returns a fixed painter's order
    <Piece key={index} part={part} />
  ));
}

interface ShipInBottleProps {
  readonly motion: Motion;
  readonly controls: RefObject<HTMLDivElement | null>;
}

export const ShipInBottle = memo(function ShipInBottle({ motion, controls }: ShipInBottleProps) {
  const [{ stage, elapsed }, setClock] = useState<{ stage: BottleStage; elapsed: number }>({
    stage: 'standing',
    elapsed: 0,
  });
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  useEffect(() => setHost(controls.current), [controls]);

  useEffect(() => {
    if (stage === 'standing') return;
    const advance = () =>
      setClock((current) =>
        current.stage === stage ? { stage: NEXT_BOTTLE_STAGE[stage], elapsed: 0 } : current,
      );
    if (stage === 'broken') {
      const timer = window.setTimeout(advance, BOTTLE_DURATION.broken);
      return () => window.clearTimeout(timer);
    }
    if (motion === 'reduced') {
      advance();
      return;
    }
    let frame = 0;
    let start: number | undefined;
    const step = (now: number) => {
      start ??= now;
      const elapsed = now - start;
      if (elapsed >= BOTTLE_DURATION[stage]) {
        advance();
        return;
      }
      setClock((current) => (current.stage === stage ? { stage, elapsed } : current));
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [stage, motion]);

  const { drawing, opacity } = useMemo(() => {
    const { pose, opacity } = bottleAt(stage, elapsed);
    return { drawing: bottleDrawingAt(pose), opacity };
  }, [stage, elapsed]);
  const standing = stage === 'standing';

  return (
    <>
      <g className="ship-in-bottle" data-stage={stage}>
        <Pieces parts={drawing.stand} />
        {!drawing.cradleInFront && <Pieces parts={drawing.cradle} />}
        <g className="bottle" opacity={opacity < 1 ? opacity : undefined}>
          {drawing.shadow && (
            <path
              className="bottle-shadow"
              d={drawing.shadow.d}
              filter="url(#desk-halo)"
              opacity={drawing.shadow.opacity}
            />
          )}
          {drawing.shards.map((d, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the shards are a fixed set
            <path key={index} className="bottle-shard" d={d} />
          ))}
          <path className="bottle-glass" d={drawing.glass} />
          {drawing.cracks.far && (
            <path className="bottle-crack" data-side="far" d={drawing.cracks.far} />
          )}
          <Pieces parts={drawing.inside} />
          <Pieces parts={drawing.rims} />
          <path className="bottle-glass-edge" d={drawing.glass} />
          {drawing.glints.map((d, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the glints are a fixed set
            <path key={index} className="bottle-glint" data-index={index} d={d} />
          ))}
          {drawing.cracks.near && (
            <path className="bottle-crack" data-side="near" d={drawing.cracks.near} />
          )}
        </g>
        {drawing.cradleInFront && <Pieces parts={drawing.cradle} />}
      </g>
      {host &&
        createPortal(
          <>
            <button
              type="button"
              className="bottle-trigger"
              style={{ ...overlay(BOTTLE_AREA.box), clipPath: BOTTLE_AREA.clipPath }}
              aria-label="Knock the ship in a bottle off its stand"
              aria-disabled={!standing}
              onClick={() => {
                if (standing) setClock({ stage: 'falling', elapsed: 0 });
              }}
            />
            <p className="visually-hidden" role="status">
              {stage === 'broken' || stage === 'fading'
                ? 'The ship in a bottle fell off the desk and cracked. It will be back on its stand shortly.'
                : ''}
            </p>
          </>,
          host,
        )}
    </>
  );
});
