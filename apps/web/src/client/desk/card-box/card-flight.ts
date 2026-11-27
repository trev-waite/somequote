import type { CSSProperties } from 'react';
import { CARD_FLIGHT } from './card-box-geometry';

/**
 * Each card rises clear of the box's walls and, before it has stopped rising, sweeps on to its place
 * on the sheet, so the two read as one curve. Cards leave one after another. On closing, the
 * sheet's writing fades, the cards sweep back above the box and settle into it.
 */
export const CARD_MOTION = {
  lift: 240,
  /** How far into the rise the flight begins. */
  takeoff: 100,
  /** How far into the rise the card's foot clears the walls. */
  clear: 160,
  flight: 520,
  stagger: 45,
  staggered: 6,
  fade: 100,
  back: 400,
  /** How long before the flight back ends the drop begins. */
  settle: 100,
} as const;

const ms = (value: number) => `${value}ms`;

const { tab } = CARD_FLIGHT;

export const SHEET_STYLE = {
  '--card-flight': ms(CARD_MOTION.flight),
  '--card-fade': ms(CARD_MOTION.fade),
  '--card-back': ms(CARD_MOTION.back),
  '--card-drop': ms(CARD_MOTION.lift),
  '--tab-width': `${(tab.width / CARD_FLIGHT.face.width) * 100}%`,
} as CSSProperties;

/**
 * When a closing card drops and the walls close over it, from the start of closing: once it is back
 * above the box, or at once if it never left.
 */
export function closingTimes(early: boolean) {
  const { fade, back, settle, lift, clear } = CARD_MOTION;
  const drop = fade + back - settle;
  return early ? { drop: 0, walls: 0 } : { drop, walls: drop + lift - clear };
}

function place(element: Element | null, attributes: Record<string, number>) {
  for (const [name, value] of Object.entries(attributes)) {
    element?.setAttribute(name, String(value));
  }
}

/**
 * Shapes a flight card like the sheet card it becomes, and its tab like that card's tab, then poses
 * both as the box card it starts as and as the sheet card it lands on.
 */
function aim(flight: SVGGElement, card: HTMLElement, slot: number, box: DOMRect, origin: DOMPoint) {
  const rect = card.getBoundingClientRect();
  const label = card.querySelector('.favorite-tab')?.getBoundingClientRect();
  const { width: w, height: h } = rect;
  const start = CARD_FLIGHT.slots[slot];
  if (!start || !label || w === 0 || h === 0) return false;
  const { face, across, down } = CARD_FLIGHT;
  const border = card.clientLeft;
  const radius = Number.parseFloat(getComputedStyle(card).borderTopLeftRadius) || 0;
  const corner = Math.max(0, radius - border / 2);
  const edge = -h / 2 + border / 2;
  place(flight.querySelector('.flight-face'), {
    x: -w / 2 + border / 2,
    y: edge,
    width: w - border,
    height: h - border,
    rx: corner,
  });
  const landed = {
    x: label.left - rect.left - w / 2 + border / 2,
    y: label.top - rect.top - h / 2 + border / 2,
    width: label.width - border,
    height: label.height + border,
  };
  place(flight.querySelector('.flight-tab'), { ...landed, rx: corner });
  const left = landed.x;
  const right = left + landed.width;
  const arc = `A${corner} ${corner} 0 0 0 `;
  const fillets = [
    `M${left - corner} ${edge}${arc}${left} ${edge - corner}`,
    `${right} ${edge - corner}${arc}${right + corner} ${edge}`,
  ];
  // Deep enough to hide the edge's unscaled stroke while the card is shrunk to fit the box.
  const cover = edge + h / 16;
  flight
    .querySelector('.flight-join-fill')
    ?.setAttribute('d', `${fillets.join('L')}V${cover}H${left - corner}Z`);
  flight.querySelector('.flight-join-line')?.setAttribute('d', fillets.join('M'));
  const stop = Number(flight.dataset.tab);
  const boxed = { width: (w * tab.width) / face.width, height: (h * tab.height) / face.height };
  const stretch = { x: boxed.width / landed.width, y: boxed.height / (edge - landed.y) };
  const tabX = -w / 2 + stop * (w - boxed.width) - landed.x * stretch.x;
  const tabY = edge - boxed.height - landed.y * stretch.y;
  flight.style.setProperty(
    '--tab-from',
    `translate(${tabX}px, ${tabY}px) scale(${stretch.x}, ${stretch.y})`,
  );
  const scale = box.width / CARD_FLIGHT.box.width;
  const wide = (face.width * scale) / w;
  const tall = (face.height * scale) / h;
  const fromX = box.left + start.x * box.width - origin.x;
  const fromY = box.top + start.y * box.height - origin.y;
  const matrix = [wide * across.x, wide * across.y, tall * down.x, tall * down.y];
  flight.style.setProperty(
    '--flight-from',
    `translate(${fromX}px, ${fromY}px) matrix(${matrix.join(', ')}, 0, 0)`,
  );
  flight.style.setProperty(
    '--flight-to',
    `translate(${rect.left - origin.x + w / 2}px, ${rect.top - origin.y + h / 2}px) matrix(1, 0, 0, 1, 0, 0)`,
  );
  flight.style.setProperty('--flight-stroke', `${border}px`);
  return true;
}

/**
 * Aims every flight card from the box to its sheet card, in the dialog's scrolled content where the
 * flight layer sits, fits the walls that hide the cards' feet to the box, and times the sheet around
 * them. Opening staggers the cards. Closing `closingAfter` ms after opening sends the cards back,
 * dropping those that had not yet taken off straight into the box, and also times a reversed close,
 * which sends the cards straight back out. Returns whether any card was still in the box.
 */
export function aimFlights(
  box: HTMLElement | null,
  dialog: HTMLDialogElement,
  closingAfter?: number,
): boolean {
  const opening = closingAfter === undefined;
  const target = box?.getBoundingClientRect();
  const frame = dialog.getBoundingClientRect();
  const origin = new DOMPoint(
    frame.left + dialog.clientLeft - dialog.scrollLeft,
    frame.top + dialog.clientTop - dialog.scrollTop,
  );
  const takeoff = opening ? CARD_MOTION.takeoff : 0;
  const flights = [...dialog.querySelectorAll<SVGGElement>('.flight-slot')].reverse();
  const landing = new Map<string, number>();
  let boxed = false;
  flights.forEach((flight, index) => {
    const id = flight.dataset.flight ?? '';
    const card = dialog.querySelector<HTMLElement>(
      `.favorite-card[data-favorite="${CSS.escape(id)}"]`,
    );
    const aimed =
      !!target && !!card && aim(flight, card, flights.length - 1 - index, target, origin);
    flight.toggleAttribute('data-aimed', aimed);
    if (!aimed) return;
    const stagger = Math.min(index, CARD_MOTION.staggered) * CARD_MOTION.stagger;
    const wait = opening ? stagger : 0;
    flight.style.setProperty('--card-wait', ms(wait));
    flight.style.setProperty('--card-delay', ms(wait + takeoff));
    landing.set(id, wait + takeoff + CARD_MOTION.flight);
    if (opening) return;
    const early = closingAfter < stagger + CARD_MOTION.takeoff;
    boxed ||= early;
    const { drop, walls } = closingTimes(early);
    flight.style.setProperty('--card-return', ms(drop));
    flight.style.setProperty('--card-walls', ms(walls));
  });
  for (const card of dialog.querySelectorAll<HTMLElement>('.favorite-card')) {
    card.style.setProperty('--card-land', ms(landing.get(card.dataset.favorite ?? '') ?? takeoff));
  }
  dialog.style.setProperty('--card-lift', ms(opening ? CARD_MOTION.lift : 0));
  dialog.style.setProperty('--card-clear', ms(opening ? CARD_MOTION.clear : 0));
  if (!target) return boxed;
  const scale = target.width / CARD_FLIGHT.box.width;
  const layer = dialog.querySelector<SVGSVGElement>('.favorites-flight');
  layer?.style.setProperty('--card-in-box', `${-CARD_FLIGHT.lift * scale}px`);
  const walls = `translate(${target.left - origin.x} ${target.top - origin.y}) scale(${scale}) translate(${-CARD_FLIGHT.box.x} ${-CARD_FLIGHT.box.y})`;
  for (const wall of dialog.querySelectorAll('.flight-wall')) wall.setAttribute('transform', walls);
  return boxed;
}
