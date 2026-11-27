import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicationDto } from '../../../shared/api-contract';
import { currentFavorites, FAVORITES_KEY, parseFavorites } from '../../favorites/favorites';
import { preferReducedMotion, render } from '../../test-render';
import { Desk } from '../Desk';
import { CARD_FLIGHT, tabStopFor } from './card-box-geometry';
import { CARD_MOTION, closingTimes } from './card-flight';

const publication = (id: string, date: string): PublicationDto =>
  PublicationDto.parse({
    date,
    quote: { category: 'general', id, text: `Quote ${id}.`, author: `Author ${id}`, source: 'S' },
  });
const stored = () => parseFavorites(localStorage.getItem(FAVORITES_KEY)).map((f) => f.quote.id);

let cleanup: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  preferReducedMotion(false);
  document.documentElement.dataset.colorScheme = 'light';
});
afterEach(() => {
  cleanup?.();
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.setItem(FAVORITES_KEY, '[]');
  currentFavorites();
  localStorage.clear();
  delete document.documentElement.dataset.colorScheme;
});

function showDesk(favorites: readonly PublicationDto[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  const view = render(<Desk remainingMs={100_000} motion="full" quote={undefined} />);
  cleanup = view.unmount;
  const trigger = view.container.querySelector<HTMLButtonElement>('.card-box-trigger');
  const dialog = document.querySelector<HTMLDialogElement>('dialog.favorites');
  if (!trigger || !dialog) throw new Error('missing card box');
  // happy-dom runs no animations; one that never ends leaves closing to the fallback timer.
  vi.spyOn(dialog, 'getAnimations').mockReturnValue([
    { playState: 'running', finished: new Promise(() => {}) } as unknown as Animation,
  ]);
  const cards = () =>
    [...dialog.querySelectorAll<HTMLElement>('.favorite-card')].map(
      (card) => `${card.hasAttribute('data-removed') ? '-' : ''}${card.dataset.favorite}`,
    );
  const action = (id: string) => {
    const button = dialog.querySelector<HTMLButtonElement>(
      `[data-favorite="${id}"] .favorite-action`,
    );
    if (!button) throw new Error(`no action for ${id}`);
    return button;
  };
  return {
    trigger,
    dialog,
    cards,
    action,
    box: () => view.container.querySelector('.card-box')?.getAttribute('data-count'),
    press: (button: HTMLElement) => act(() => button.click()),
    status: () => dialog.querySelector('[role="status"]')?.textContent,
    fade: () => act(() => vi.advanceTimersByTime(1000)),
  };
}

describe('CardBox', () => {
  it('files a card for each favorite and names the count', () => {
    const { trigger, box } = showDesk([
      publication('a', '2026-11-24'),
      publication('b', '2026-11-20'),
    ]);
    expect(box()).toBe('2');
    expect(trigger.getAttribute('aria-label')).toBe('Favorites, 2 quotes');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('notes when the favorites shown are for this visit only', () => {
    const { trigger, dialog, action, press } = showDesk([
      publication('a', '2026-11-24'),
      publication('b', '2026-11-20'),
    ]);
    press(trigger);
    expect(dialog.querySelector('.favorites-note')).toBeNull();
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    try {
      press(action('a'));
      expect(dialog.querySelector('.favorites-note')?.textContent).toMatch(/until you leave/);
    } finally {
      setItem.mockRestore();
    }
    press(action('a'));
    expect(dialog.querySelector('.favorites-note')).toBeNull();
  });

  it('opens a sheet of favorites, newest first, and fades out before closing', () => {
    const { trigger, dialog, cards, press, fade } = showDesk([
      publication('a', '2026-11-24'),
      publication('b', '2026-11-20'),
    ]);
    expect(dialog.open).toBe(false);
    press(trigger);
    expect(dialog.open).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(cards()).toEqual(['a', 'b']);
    expect(document.activeElement?.id).toBe('favorites-title');
    expect(dialog.textContent).toContain('“Quote a.”');
    const close = dialog.querySelector<HTMLButtonElement>('.favorites-close');
    if (!close) throw new Error('missing close');
    press(close);
    expect(dialog.open).toBe(true);
    expect(dialog.hasAttribute('data-closing')).toBe(true);
    fade();
    expect(dialog.open).toBe(false);
    expect(dialog.hasAttribute('data-closing')).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('reverses its fade when the box is pressed again before it closes', () => {
    const { trigger, dialog, press, fade } = showDesk([publication('a', '2026-11-24')]);
    press(trigger);
    act(() => vi.advanceTimersByTime(CARD_MOTION.lift));
    const close = dialog.querySelector<HTMLButtonElement>('.favorites-close');
    if (!close) throw new Error('missing close');
    press(close);
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 50, 50));
    act(() => {
      dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 20, clientY: 20 }));
    });
    expect(dialog.hasAttribute('data-closing')).toBe(true);
    act(() => {
      dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 120, clientY: 130 }));
    });
    expect(dialog.hasAttribute('data-closing')).toBe(false);
    fade();
    expect(dialog.open).toBe(true);
  });

  it('ignores Remove once dismissal starts, and fades through a second Escape', () => {
    const { trigger, dialog, action, press, fade } = showDesk([publication('a', '2026-11-24')]);
    press(trigger);
    const pressEscape = () =>
      act(() => {
        dialog.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        );
      });
    pressEscape();
    expect(dialog.hasAttribute('data-closing')).toBe(true);
    press(action('a'));
    expect(stored()).toEqual(['a']);
    pressEscape();
    expect(dialog.open).toBe(true);
    fade();
    expect(dialog.open).toBe(false);
  });

  it('flies the box’s cards, tabs and all, to their sheet cards, and back to the box where it is', () => {
    const { trigger, dialog, press } = showDesk([
      publication('a', '2026-11-24'),
      publication('b', '2026-11-20'),
    ]);
    const order = ['a', 'b'];
    let box = new DOMRect(500, 400, 40, 40);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this === trigger) return box;
      if (this.classList.contains('favorite-tab')) {
        const at = order.indexOf(this.parentElement?.dataset.favorite ?? '');
        return new DOMRect(100, 88 + at * 250, 120, 12);
      }
      const index = order.indexOf(this.dataset.favorite ?? '');
      return index < 0
        ? new DOMRect(0, 0, 1000, 1000)
        : new DOMRect(50, 100 + index * 250, 500, 200);
    });
    for (const sheetCard of dialog.querySelectorAll<HTMLElement>('.favorite-card')) {
      sheetCard.style.borderRadius = '4px';
    }
    press(trigger);
    const flight = (id: string) => {
      const g = dialog.querySelector<SVGGElement>(`.flight-slot[data-flight="${id}"]`);
      if (!g) throw new Error(`no flight for ${id}`);
      return g;
    };
    const card = (id: string) => dialog.querySelector<HTMLElement>(`[data-favorite="${id}"]`);
    const from = (id: string) =>
      (
        flight(id)
          .style.getPropertyValue('--flight-from')
          .match(/-?[\d.]+(?=px)/g) ?? []
      ).map(Number);
    const front = CARD_FLIGHT.slots[1];
    if (!front) throw new Error('missing slot');
    expect(
      [...dialog.querySelectorAll<SVGGElement>('.flight-slot')].map((g) => g.dataset.flight),
    ).toEqual(['b', 'a']);
    expect(from('a')[0]).toBeCloseTo(500 + front.x * 40, 3);
    expect(from('a')[1]).toBeCloseTo(400 + front.y * 40, 3);
    expect(flight('a').style.getPropertyValue('--flight-to')).toMatch(/^translate\(300px, 200px\)/);
    expect(flight('a').querySelector('.flight-face')?.getAttribute('width')).toBe('500');
    const tab = flight('a').querySelector('.flight-tab');
    expect([tab?.getAttribute('x'), tab?.getAttribute('y'), tab?.getAttribute('width')]).toEqual([
      '-200',
      '-112',
      '120',
    ]);
    expect(flight('a').querySelector('.flight-join-line')?.getAttribute('d')).toBe(
      'M-204 -100A4 4 0 0 0 -200 -104M-80 -104A4 4 0 0 0 -76 -100',
    );
    expect(flight('a').querySelector('.flight-join-fill')?.getAttribute('d')).toBe(
      'M-204 -100A4 4 0 0 0 -200 -104L-80 -104A4 4 0 0 0 -76 -100V-87.5H-204Z',
    );
    const { face, tab: drawn } = CARD_FLIGHT;
    const stop = tabStopFor('2026-11-24');
    const boxed = {
      x: (500 * drawn.width) / face.width,
      y: (200 * drawn.height) / face.height,
    };
    const stretch = { x: boxed.x / 120, y: boxed.y / 12 };
    const [tabX = Number.NaN, tabY = Number.NaN] = (
      flight('a')
        .style.getPropertyValue('--tab-from')
        .match(/-?[\d.e-]+(?=px)/g) ?? []
    ).map(Number);
    expect(tabX).toBeCloseTo(-250 + stop * (500 - boxed.x) + 200 * stretch.x, 3);
    expect(tabY).toBeCloseTo(-100 - (200 * drawn.height) / face.height + 112 * stretch.y, 3);
    expect(flight('a').dataset.tab).toBe(String(tabStopFor('2026-11-24')));
    expect(card('a')?.style.getPropertyValue('--tab-stop')).toBe(String(tabStopFor('2026-11-24')));
    expect(flight('a').style.getPropertyValue('--card-delay')).toBe(`${CARD_MOTION.takeoff}ms`);
    expect(flight('b').style.getPropertyValue('--card-wait')).toBe(`${CARD_MOTION.stagger}ms`);
    expect(flight('b').style.getPropertyValue('--card-delay')).toBe(
      `${CARD_MOTION.stagger + CARD_MOTION.takeoff}ms`,
    );
    expect(card('a')?.style.getPropertyValue('--card-land')).toBe(
      `${CARD_MOTION.takeoff + CARD_MOTION.flight}ms`,
    );
    act(() => vi.advanceTimersByTime(CARD_MOTION.takeoff + CARD_MOTION.stagger / 2));
    box = new DOMRect(100, 200, 40, 40);
    const close = dialog.querySelector<HTMLButtonElement>('.favorites-close');
    if (!close) throw new Error('missing close');
    press(close);
    expect(from('a')[0]).toBeCloseTo(100 + front.x * 40, 3);
    expect(from('a')[1]).toBeCloseTo(200 + front.y * 40, 3);
    expect(flight('b').style.getPropertyValue('--card-delay')).toBe('0ms');
    const flying = closingTimes(false);
    expect(flight('a').style.getPropertyValue('--card-return')).toBe(`${flying.drop}ms`);
    expect(flight('a').style.getPropertyValue('--card-walls')).toBe(`${flying.walls}ms`);
    expect(flight('b').style.getPropertyValue('--card-return')).toBe('0ms');
    expect(flight('b').style.getPropertyValue('--card-walls')).toBe('0ms');
    expect(dialog.hasAttribute('data-early')).toBe(true);
    expect(dialog.querySelector('.flight-wall')?.getAttribute('transform')).toMatch(
      /^translate\(100 200\)/,
    );
  });

  it('drops cards still lifting straight back into the box, and only then lets the box reopen', () => {
    const { trigger, dialog, press } = showDesk([publication('a', '2026-11-24')]);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this === trigger ? new DOMRect(100, 100, 50, 50) : new DOMRect(0, 0, 300, 200);
    });
    press(trigger);
    const close = dialog.querySelector<HTMLButtonElement>('.favorites-close');
    if (!close) throw new Error('missing close');
    press(close);
    expect(dialog.hasAttribute('data-early')).toBe(true);
    expect(
      dialog.querySelector<SVGGElement>('.flight-slot')?.style.getPropertyValue('--card-return'),
    ).toBe('0ms');
    act(() => {
      dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 120, clientY: 130 }));
    });
    expect(dialog.hasAttribute('data-closing')).toBe(true);
  });

  it('closes once every fade and flight has settled, even one another change cancelled', async () => {
    const { trigger, dialog, press } = showDesk([publication('a', '2026-11-24')]);
    press(trigger);
    let settle = () => {};
    const finished = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const cancelled = Promise.reject(new DOMException('replaced', 'AbortError'));
    cancelled.catch(() => undefined);
    vi.spyOn(dialog, 'getAnimations')
      .mockReturnValueOnce([
        { finished, playState: 'running' } as unknown as Animation,
        { finished: cancelled, playState: 'running' } as unknown as Animation,
      ])
      .mockReturnValue([]);
    act(() => {
      dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    });
    expect(dialog.hasAttribute('data-closing')).toBe(true);
    await act(async () => {
      await Promise.resolve();
    });
    expect(dialog.open).toBe(true);
    await act(async () => {
      settle();
      await finished;
      await Promise.resolve();
    });
    expect(dialog.open).toBe(false);
  });

  it('keeps Escape on the fade after the focused card is deleted in another tab', () => {
    const { trigger, dialog, action, press } = showDesk([
      publication('a', '2026-11-24'),
      publication('b', '2026-11-20'),
    ]);
    press(trigger);
    action('a').focus();
    act(() => {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([publication('b', '2026-11-20')]));
      window.dispatchEvent(new StorageEvent('storage', { key: FAVORITES_KEY }));
    });
    expect(dialog.contains(document.activeElement)).toBe(true);
    document.body.focus();
    const pressEscape = (init: KeyboardEventInit = {}) =>
      act(() => {
        document.body.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, ...init }),
        );
      });
    pressEscape({ isComposing: true });
    expect(dialog.hasAttribute('data-closing')).toBe(false);
    pressEscape();
    expect(dialog.hasAttribute('data-closing')).toBe(true);
    expect(dialog.open).toBe(true);
  });

  it('removes with an undo in place, moving focus with the change', () => {
    const { trigger, dialog, cards, action, box, press } = showDesk([
      publication('a', '2026-11-24'),
      publication('b', '2026-11-20'),
      publication('c', '2026-11-19'),
    ]);
    press(trigger);
    press(action('b'));
    expect(cards()).toEqual(['a', '-b', 'c']);
    expect(stored()).toEqual(['a', 'c']);
    expect(box()).toBe('2');
    expect(document.activeElement).toBe(action('b'));
    expect(action('b').textContent).toBe('Undo');
    expect(dialog.querySelector('[role="status"]')?.textContent).toBe(
      'Removed “Quote b.” from favorites.',
    );

    press(action('b'));
    expect(cards()).toEqual(['a', 'b', 'c']);
    expect(stored()).toEqual(['a', 'b', 'c']);
    expect(document.activeElement).toBe(action('b'));
    expect(action('b').textContent).toBe('Remove');
  });

  it('announces each removal by its quote, and handles favorites another tab adds', () => {
    const { trigger, cards, action, press, status } = showDesk([
      publication('a', '2026-11-24'),
      publication('b', '2026-11-20'),
    ]);
    press(trigger);
    press(action('a'));
    expect(status()).toBe('Removed “Quote a.” from favorites.');
    press(action('b'));
    expect(status()).toBe('Removed “Quote b.” from favorites.');
    act(() => {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([publication('c', '2026-11-25')]));
      window.dispatchEvent(new StorageEvent('storage', { key: FAVORITES_KEY }));
    });
    expect(cards()).toEqual(['-a', '-b', 'c']);
    press(action('c'));
    expect(cards()).toEqual(['-a', '-b', '-c']);
    expect(document.activeElement).toBe(action('c'));
    press(action('c'));
    expect(stored()).toEqual(['c']);
  });

  it('closes from the scrim, but not when a text selection is dragged out onto it', () => {
    const { trigger, dialog, press, fade } = showDesk([publication('a', '2026-11-24')]);
    press(trigger);
    const quote = dialog.querySelector('blockquote');
    if (!quote) throw new Error('missing quote');
    const pressOn = (target: Element) =>
      act(() => {
        target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      });
    pressOn(quote);
    press(dialog);
    expect(dialog.open).toBe(true);
    pressOn(dialog);
    press(dialog);
    fade();
    expect(dialog.open).toBe(false);
  });

  it('names each Remove by its card’s date, so same-author cards stay distinct', () => {
    const { trigger, action, press } = showDesk([
      publication('a', '2026-11-24'),
      publication('b', '2026-11-20'),
    ]);
    press(trigger);
    const name = (id: string) =>
      action(id)
        .getAttribute('aria-labelledby')
        ?.split(' ')
        .map((part) => document.getElementById(part)?.textContent)
        .join(' ');
    expect(name('a')).toMatch(/^Remove \S.*2026$/);
    expect(name('a')).not.toBe(name('b'));
  });

  it('clears removed rows as it closes, so a reopened sheet aims at the cards as shown', () => {
    const { trigger, dialog, action, press, fade } = showDesk([
      publication('a', '2026-11-24'),
      publication('b', '2026-11-20'),
    ]);
    press(trigger);
    press(action('a'));
    expect(dialog.querySelectorAll('[data-removed]')).toHaveLength(1);
    const close = dialog.querySelector<HTMLButtonElement>('.favorites-close');
    if (!close) throw new Error('missing close');
    press(close);
    fade();
    expect(dialog.open).toBe(false);
    expect(dialog.querySelectorAll('[data-removed]')).toHaveLength(0);
  });

  it('forgets removals once the sheet closes', () => {
    const { trigger, dialog, cards, action, press } = showDesk([publication('a', '2026-11-24')]);
    press(trigger);
    press(action('a'));
    expect(cards()).toEqual(['-a']);
    act(() => dialog.close());
    press(trigger);
    expect(cards()).toEqual([]);
    expect(dialog.querySelector('.favorites-empty')?.textContent).toMatch(/No favorites yet/);
  });
});
