import {
  type CSSProperties,
  memo,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useFavorites } from '../../favorites/favorites';
import { Heart } from '../../favorites/Heart';
import { DeskPart } from '../DeskPart';
import { overlay } from '../desk-geometry';
import { CARD_BOX, CARD_BOX_AREA, cardBoxDrawingFor, tabStopFor } from './card-box-geometry';
import { FavoritesSheet } from './FavoritesSheet';

/** The whole box is the target; only its keyboard highlight follows the drawing's outline. */
const triggerStyle = {
  ...overlay(CARD_BOX_AREA.box),
  '--card-box-outline': CARD_BOX_AREA.clipPath,
} as CSSProperties;

export const CardBox = memo(function CardBox({
  controls,
}: {
  readonly controls: RefObject<HTMLDivElement | null>;
}) {
  const favorites = useFavorites();
  const count = favorites.length;
  const tabs = favorites
    .slice(0, CARD_BOX.capacity)
    .map((favorite) => tabStopFor(favorite.date))
    .join();
  const drawing = useMemo(() => cardBoxDrawingFor(tabs ? tabs.split(',').map(Number) : []), [tabs]);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => setHost(controls.current), [controls]);

  return (
    <>
      <g className="card-box" data-count={count}>
        {drawing.back.map((part, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the geometry returns a fixed painter's order
          <DeskPart key={index} part={part} />
        ))}
        <path className="card-box-hollow" d={drawing.hollow} />
        {drawing.cards.map((part, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: cards fill the box in a fixed order
          <g key={index} className="card-box-card">
            <DeskPart part={part} />
          </g>
        ))}
        {drawing.front.map((part, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the geometry returns a fixed painter's order
          <DeskPart key={index} part={part} />
        ))}
        <g className="card-box-mark" transform={drawing.mark}>
          <Heart clipId="card-box-heart" />
        </g>
      </g>
      {host &&
        createPortal(
          <button
            ref={triggerRef}
            type="button"
            className="card-box-trigger"
            style={triggerStyle}
            aria-label={`Favorites, ${count === 1 ? '1 quote' : `${count} quotes`}`}
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          />,
          host,
        )}
      <FavoritesSheet open={open} origin={triggerRef} onClose={() => setOpen(false)} />
    </>
  );
});
