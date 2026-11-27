import {
  type CSSProperties,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  favoritesSaved,
  removeFavorite,
  restoreFavorite,
  useFavorites,
} from '../../favorites/favorites';
import { attributionOf } from '../../publication/Publication';
import { CARD_BOX, CARD_FLIGHT, tabStopFor } from './card-box-geometry';
import { aimFlights, CARD_MOTION, closingTimes, SHEET_STYLE } from './card-flight';
import {
  formatPublicationDate,
  type Removal,
  restoreIndex,
  sheetEntries,
  stillRemoved,
  withRemoval,
} from './sheet-entries';

/** Longer than the cards' return, for tabs where animations never run. */
const CLOSE_FALLBACK_MS = closingTimes(false).drop + CARD_MOTION.lift + 100;

interface FavoritesSheetProps {
  readonly open: boolean;
  readonly origin: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
}

/** The page under the scrim is inert while it fades, so a press on the box there reopens it. */
const runningIn = (dialog: HTMLDialogElement) =>
  (dialog.getAnimations?.({ subtree: true }) ?? []).filter(
    (animation) => animation.playState === 'running',
  );

const within = (box: DOMRect, x: number, y: number) =>
  x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

const opening = (text: string) => {
  const words = text.split(/\s+/);
  return words.length > 6 ? `${words.slice(0, 6).join(' ')}…` : text;
};

export function FavoritesSheet({ open, origin, onClose }: FavoritesSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const pressedScrim = useRef(false);
  const openedAt = useRef(0);
  const favorites = useFavorites();
  const [removals, setRemovals] = useState<readonly Removal[]>([]);
  const [focusOn, setFocusOn] = useState<{ readonly id: string } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [closing, setClosing] = useState(false);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const sheet = sheetRef.current;
    if (!dialog || !sheet) return;
    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }
    if (dialog.open) return;
    dialog.dataset.arriving = '';
    openedAt.current = performance.now();
    dialog.style.setProperty('--sheet-delay', `${CARD_MOTION.takeoff}ms`);
    dialog.showModal();
    titleRef.current?.focus();
    dialog.scrollTop = 0;
    aimFlights(origin.current, dialog);
    // Commits the cards' pose above the box before releasing them, so they fly from it.
    sheet.getBoundingClientRect();
    delete dialog.dataset.arriving;
  }, [open, origin]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!closing || !dialog) return;
    let current = true;
    const finish = () => {
      if (current) dialog.close();
    };
    const timer = window.setTimeout(finish, CLOSE_FALLBACK_MS);
    // Waits out every fade and flight in the sheet, however far an interrupted opening had got,
    // including ones that start or are replaced meanwhile; reversing the close ends the wait.
    const settle = async () => {
      let moving = runningIn(dialog);
      while (current && moving.length > 0) {
        await Promise.allSettled(moving.map((animation) => animation.finished));
        moving = runningIn(dialog);
      }
      finish();
    };
    void settle();
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [closing]);

  useEffect(() => {
    if (!open) return;
    // On the document, so Escape still fades the sheet when focus has fallen out of it.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || !dialogRef.current?.open) return;
      event.preventDefault();
      closeRef.current();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open]);

  // A card deleted in another tab can take focus with it; an open sheet keeps focus inside.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog?.open && !dialog.contains(document.activeElement)) {
      titleRef.current?.focus({ preventScroll: true });
    }
  });

  useEffect(() => {
    setRemovals((current) => {
      const next = stillRemoved(current, favorites);
      return next.length === current.length ? current : next;
    });
  }, [favorites]);

  useEffect(() => {
    if (!focusOn) return;
    const card = sheetRef.current?.querySelector(`[data-favorite="${CSS.escape(focusOn.id)}"]`);
    card?.querySelector<HTMLButtonElement>('.favorite-action')?.focus();
  }, [focusOn]);

  const entries = sheetEntries(favorites, removals);
  // The front card of the box is the newest, and paints over the cards behind it.
  const flights = favorites.slice(0, CARD_BOX.capacity).reverse();
  const count = favorites.length;
  const onScrim = (target: EventTarget, dialog: HTMLDialogElement) =>
    target === dialog || target === scrimRef.current;
  const close = () => {
    const dialog = dialogRef.current;
    if (!dialog?.open || closing) return;
    dialog.style.setProperty('--sheet-delay', '0ms');
    // Cards that have not yet taken off drop straight back, and the box can't reopen until they do.
    const early = aimFlights(origin.current, dialog, performance.now() - openedAt.current);
    dialog.toggleAttribute('data-early', early);
    setClosing(true);
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  return createPortal(
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape is handled on the document; this is the scrim
    <dialog
      ref={dialogRef}
      className="favorites"
      aria-labelledby="favorites-title"
      data-closing={closing ? '' : undefined}
      style={SHEET_STYLE}
      onCancel={(event) => {
        if (!event.cancelable) return;
        event.preventDefault();
        close();
      }}
      onClose={(event) => {
        // Cleared now, not on reopening, so the next opening measures only the cards it shows.
        setRemovals([]);
        setFocusOn(null);
        setAnnouncement('');
        setClosing(false);
        event.currentTarget.removeAttribute('data-early');
        onClose();
        origin.current?.focus({ preventScroll: true });
      }}
      onPointerDown={(event) => {
        pressedScrim.current = onScrim(event.target, event.currentTarget);
      }}
      onClick={(event) => {
        if (closing) {
          const box = origin.current?.getBoundingClientRect();
          const early = event.currentTarget.hasAttribute('data-early');
          if (box && !early && within(box, event.clientX, event.clientY)) setClosing(false);
          return;
        }
        // A text selection dragged out of a card also ends in a click on the scrim.
        if (pressedScrim.current && onScrim(event.target, event.currentTarget)) close();
      }}
    >
      <div ref={scrimRef} className="favorites-scrim" />
      <svg className="favorites-flight" aria-hidden="true" focusable="false">
        <defs>
          <clipPath id="favorites-front-wall">
            <path className="flight-wall" clipRule="evenodd" d={CARD_FLIGHT.walls.front} />
          </clipPath>
          <clipPath id="favorites-right-wall">
            <path className="flight-wall" clipRule="evenodd" d={CARD_FLIGHT.walls.right} />
          </clipPath>
        </defs>
        {flights.map((favorite) => (
          <g
            key={favorite.quote.id}
            className="flight-slot flight-walls flight-front"
            data-flight={favorite.quote.id}
            data-tab={tabStopFor(favorite.date)}
          >
            <g className="flight-walls flight-right">
              <g className="flight-card">
                <g className="flight-pose">
                  <rect className="flight-tab" />
                  <rect className="flight-face" />
                  <g className="flight-join">
                    <path className="flight-join-fill" />
                    <path className="flight-join-line" />
                  </g>
                </g>
              </g>
            </g>
          </g>
        ))}
      </svg>
      <div ref={sheetRef} className="favorites-sheet">
        <header className="favorites-header">
          <h2 ref={titleRef} id="favorites-title" className="favorites-title" tabIndex={-1}>
            Favorites
          </h2>
          <span className="favorites-count">{count === 1 ? '1 quote' : `${count} quotes`}</span>
          <button
            type="button"
            className="favorites-close"
            aria-label="Close favorites"
            onClick={close}
          >
            <svg
              className="favorites-close-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
          {!favoritesSaved() && (
            <p className="favorites-note">
              This browser isn’t saving favorites, so these last only until you leave.
            </p>
          )}
        </header>
        {entries.length === 0 ? (
          <p className="favorites-empty">
            No favorites yet. Tap the heart beneath a quote to keep it here.
          </p>
        ) : (
          <ol className="favorites-list">
            {entries.map((entry) => {
              const { quote, date } = entry.favorite;
              const { primary, secondary } = attributionOf(quote);
              const captionId = `favorite-${quote.id}`;
              const action = entry.kind === 'kept' ? 'Remove' : 'Undo';
              return (
                <li
                  key={quote.id}
                  className="favorite-card"
                  data-favorite={quote.id}
                  data-removed={entry.kind === 'removed' ? '' : undefined}
                  style={{ '--tab-stop': tabStopFor(date) } as CSSProperties}
                >
                  {entry.kind === 'kept' && <span className="favorite-tab" aria-hidden="true" />}
                  <div className="favorite-header">
                    {entry.kind === 'kept' ? (
                      <time className="favorite-date" id={`${captionId}-date`} dateTime={date}>
                        {formatPublicationDate(date)}
                      </time>
                    ) : (
                      <p className="favorite-date favorite-removed" id={captionId}>
                        Removed “{quote.text}”
                      </p>
                    )}
                    <button
                      type="button"
                      className="favorite-action"
                      data-label={action}
                      id={`${captionId}-action`}
                      aria-labelledby={
                        entry.kind === 'kept' ? `${captionId}-action ${captionId}-date` : undefined
                      }
                      aria-describedby={captionId}
                      onClick={() => {
                        if (closing) return;
                        if (entry.kind === 'kept') {
                          setRemovals((current) => withRemoval(current, entries, quote.id));
                          removeFavorite(quote.id);
                          setAnnouncement(`Removed “${opening(quote.text)}” from favorites.`);
                        } else {
                          restoreFavorite(entry.favorite, restoreIndex(entries, quote.id));
                          setRemovals((current) =>
                            current.filter((removal) => removal.favorite.quote.id !== quote.id),
                          );
                          setAnnouncement(`Restored “${opening(quote.text)}” to favorites.`);
                        }
                        setFocusOn({ id: quote.id });
                      }}
                    >
                      {action}
                    </button>
                  </div>
                  {entry.kind === 'kept' && (
                    <figure className="favorite-figure">
                      <blockquote className="favorite-quote">“{quote.text}”</blockquote>
                      <figcaption className="favorite-attribution" id={captionId}>
                        <span className="attribution-primary">{primary}</span>
                        <span className="attribution-secondary">{secondary}</span>
                      </figcaption>
                    </figure>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <p className="visually-hidden" role="status">
          {announcement}
        </p>
      </div>
    </dialog>,
    document.body,
  );
}
