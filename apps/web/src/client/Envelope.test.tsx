import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuoteDto } from '../shared/api-contract';
import { Desk } from './Desk';
import type { Motion } from './reveal';
import { preferReducedMotion, render } from './test-render';

const quote = QuoteDto.parse({
  category: 'general',
  id: 'thoreau-morning-star',
  text: 'There is more day to dawn. The sun is but a morning star.',
  author: 'Henry David Thoreau',
  source: 'Walden',
});

let cleanup: (() => void) | undefined;

beforeEach(() => {
  preferReducedMotion(false);
  document.documentElement.dataset.colorScheme = 'light';
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup?.();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
  delete document.documentElement.dataset.colorScheme;
});

function stubNavigator(overrides: Record<string, unknown>) {
  const stub = Object.create(navigator);
  for (const [key, value] of Object.entries(overrides)) {
    Object.defineProperty(stub, key, { value });
  }
  vi.stubGlobal('navigator', stub);
}

const SETTLE_MS = 3000;

function showDesk(motion: Motion = 'full') {
  const view = render(<Desk remainingMs={100_000} motion={motion} quote={quote} />);
  cleanup = view.unmount;
  const query = <T extends Element>(selector: string) => view.container.querySelector<T>(selector);
  const trigger = query<HTMLButtonElement>('.envelope-trigger');
  if (!trigger) throw new Error('missing envelope');
  // Small steps let React run each phase's effects before the next one is due, as a browser would.
  const wait = (ms: number) => {
    for (let waited = 0; waited < ms; waited += 50) {
      act(() => vi.advanceTimersByTime(Math.min(50, ms - waited)));
    }
  };
  const press = (target: Element) =>
    act(() => {
      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
      target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  const optionElements = () => [
    ...view.container.querySelectorAll<HTMLElement>('.envelope-option'),
  ];
  const options = () => optionElements().map((option) => option.textContent);
  const open = () => {
    press(trigger);
    wait(SETTLE_MS);
  };
  const fly = () => {
    const handle = query('.envelope-pull');
    if (!handle) throw new Error('missing letter grip');
    press(handle);
    wait(1000);
    const airplane = query('.envelope-flight-trigger');
    if (!airplane) throw new Error('missing airplane');
    press(airplane);
  };
  return { query, trigger, wait, press, options, optionElements, open, fly };
}

describe('Envelope', () => {
  it('lifts off the desk to offer three ways to share', () => {
    const { trigger, wait, press, options } = showDesk();
    expect(trigger.getAttribute('aria-disabled')).toBe('false');
    expect(options()).toEqual([]);

    press(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(options()).toEqual([]);
    wait(SETTLE_MS);

    expect(options()).toEqual(['Copy link', 'Post on X', 'Send by email']);
    expect(document.activeElement?.textContent).toBe('Copy link');
  });

  it('links to a post on X and an email carrying the quote', () => {
    const { query, open } = showDesk();
    open();
    const links = [...(query('.envelope-card')?.querySelectorAll('a') ?? [])];
    const [x, email] = links.map((link) => link.getAttribute('href') ?? '');
    expect(new URL(x ?? '').searchParams.get('text')).toContain('There is more day to dawn.');
    expect(links[0]?.getAttribute('target')).toBe('_blank');
    expect(decodeURIComponent(email ?? '')).toContain('— Henry David Thoreau');
  });

  it('offers the system share sheet where there is one', async () => {
    const share = vi.fn(() => Promise.resolve());
    stubNavigator({ share });
    const { options, optionElements, open } = showDesk();
    open();
    expect(options().at(-1)).toBe('More ways to share');
    await act(async () => optionElements().at(-1)?.click());
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ url: `${window.location.origin}/` }),
    );
  });

  it('copies the link and says so', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubNavigator({ clipboard: { writeText }, share: undefined });
    const { query, options, optionElements, open, wait } = showDesk();
    open();
    await act(async () => optionElements()[0]?.click());
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/`);
    expect(options()[0]).toBe('Link copied');
    expect(query('[role="status"]')?.textContent).toBe('Link copied');
    wait(4999);
    expect(options()[0]).toBe('Link copied');
    wait(1);
    expect(options()[0]).toBe('Copy link');
  });

  it('starts a fresh five seconds when the link is copied again', async () => {
    stubNavigator({ clipboard: { writeText: () => Promise.resolve() } });
    const { options, optionElements, open, wait } = showDesk();
    open();
    await act(async () => optionElements()[0]?.click());
    wait(4000);
    await act(async () => optionElements()[0]?.click());
    wait(4000);
    expect(options()[0]).toBe('Link copied');
    wait(1000);
    expect(options()[0]).toBe('Copy link');
  });

  it.each(['mouse', 'touch'])(
    'pulls out the lower airplane with %s and lets it be pushed back in',
    (pointerType) => {
      const { query, open, wait, options } = showDesk();
      open();
      const handle = query<HTMLButtonElement>('.envelope-pull');
      if (!handle) throw new Error('missing letter grip');
      const letter = query('.envelope-letter')?.parentElement;
      const before = letter?.getAttribute('transform');
      expect(query('.envelope-flight-trigger')).toBeNull();
      const pointer = (type: string, clientY: number, target: Element = handle) =>
        act(() => {
          target.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              pointerId: 1,
              button: 0,
              pointerType,
              clientY,
            }),
          );
        });
      pointer('pointerdown', 200);
      pointer('pointermove', 155);
      expect(letter?.getAttribute('transform')).not.toBe(before);
      pointer('pointerup', 155);
      expect(handle.getAttribute('aria-expanded')).toBe('true');
      wait(1000);
      expect(letter?.getAttribute('transform')).not.toBe(before);
      expect(query('.envelope-flight-trigger')?.getAttribute('aria-label')).toBe(
        'Fly paper airplane',
      );
      const airplane = query('.envelope-flight-trigger');
      if (!airplane) throw new Error('missing airplane');
      pointer('pointerdown', 155, airplane);
      pointer('pointermove', 200, airplane);
      pointer('pointerup', 200, airplane);
      wait(1000);
      expect(handle.getAttribute('aria-expanded')).toBe('false');
      expect(query('.envelope-flight-trigger')).toBeNull();
      expect(letter?.getAttribute('transform')).toBe(before);
      expect(options()).toEqual(['Copy link', 'Post on X', 'Send by email']);
    },
  );

  it.each(['mouse', 'touch'])('collapses the envelope after a downward %s drag', (pointerType) => {
    const { query, trigger, options, open, wait } = showDesk();
    open();
    const letter = query('.envelope-letter')?.parentElement;
    const handle = query('.envelope-pull');
    if (!handle) throw new Error('missing letter');
    const pointer = (type: string, clientY: number) =>
      act(() => {
        handle.dispatchEvent(
          new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, pointerType, clientY }),
        );
      });
    pointer('pointerdown', 200);
    pointer('pointermove', 245);
    const beforeRelease = letter?.getAttribute('transform');
    pointer('pointerup', 245);
    expect(options()).toEqual([]);
    expect(letter?.getAttribute('transform')).toBe(beforeRelease);
    expect(document.activeElement).toBe(trigger);
    wait(SETTLE_MS);
    expect(trigger.getAttribute('aria-disabled')).toBe('false');
    open();
    expect(options()).toHaveLength(3);
  });

  it('keeps the envelope open after a small or cancelled downward drag', () => {
    const { query, options, open, wait } = showDesk();
    open();
    const handle = query('.envelope-pull');
    if (!handle) throw new Error('missing letter');
    for (const [distance, release] of [
      [6, 'pointerup'],
      [45, 'pointercancel'],
    ] as const) {
      const pointer = (type: string, clientY: number) =>
        act(() => {
          handle.dispatchEvent(
            new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientY }),
          );
        });
      pointer('pointerdown', 200);
      pointer('pointermove', 200 + distance);
      wait(150);
      pointer(release, 200 + distance);
      wait(1000);
      expect(options()).toHaveLength(3);
    }
  });

  it('flies away, stays gone for three seconds, then floats back ready to open', () => {
    const { query, trigger, open, wait, fly } = showDesk();
    open();
    fly();
    expect(query('.envelope')?.getAttribute('data-flight')).toBe('folding');
    wait(1550);
    expect(query('.paper-airplane')).not.toBeNull();
    wait(5650);
    expect(query('.envelope')?.getAttribute('visibility')).toBe('hidden');
    wait(2800);
    expect(query('.envelope')?.getAttribute('data-flight')).toBe('away');
    wait(250);
    expect(query('.envelope')?.getAttribute('data-flight')).toBe('landing');
    expect(query('.envelope-light')).not.toBeNull();
    wait(3500);
    expect(trigger.getAttribute('aria-disabled')).toBe('false');
    expect(query('.envelope')?.hasAttribute('data-flight')).toBe(false);
    open();
    expect(query('.envelope-option')?.textContent).toBe('Copy link');
  });

  it('restores the envelope immediately when scrolling while the airplane is gone', () => {
    const { query, trigger, open, wait, fly } = showDesk();
    open();
    fly();
    wait(7300);
    expect(query('.envelope')?.getAttribute('data-flight')).toBe('away');
    act(() => {
      window.scrollTo(0, window.scrollY - 100);
      window.dispatchEvent(new Event('scroll'));
    });
    expect(trigger.getAttribute('aria-disabled')).toBe('false');
    expect(query('.envelope')?.hasAttribute('data-flight')).toBe(false);
    wait(9000);
    expect(query('.envelope')?.hasAttribute('data-flight')).toBe(false);
  });

  it('lets keyboard users reveal and fly the airplane without the full-motion sequence', () => {
    const { query, trigger, press, open, wait } = showDesk('reduced');
    open();
    const handle = query('.envelope-pull');
    if (!handle) throw new Error('missing letter grip');
    act(() =>
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })),
    );
    expect(handle.getAttribute('aria-label')).toBe('Push letter back into envelope');
    act(() =>
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
    );
    expect(query('.envelope-flight-trigger')).toBeNull();
    act(() =>
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })),
    );
    const airplane = query('.envelope-flight-trigger');
    if (!airplane) throw new Error('missing airplane');
    press(airplane);
    expect(query('.envelope')?.getAttribute('data-flight')).toBe('away');
    wait(3000);
    expect(trigger.getAttribute('aria-disabled')).toBe('false');
    expect(query('.envelope')?.hasAttribute('data-flight')).toBe(false);
  });

  it('puts an extended letter away from its current position without a jump', () => {
    const { query, press, open, wait } = showDesk();
    open();
    const handle = query('.envelope-pull');
    if (!handle) throw new Error('missing letter grip');
    press(handle);
    wait(1000);
    const letter = query('.envelope-letter')?.parentElement;
    const before = letter?.getAttribute('transform');
    press(document.body);
    expect(letter?.getAttribute('transform')).toBe(before);
  });

  it('folds shut on a press anywhere else, without switching the lamp', () => {
    const { query, wait, press, options, open, trigger } = showDesk();
    open();
    const lamp = query('.lamp-switch');
    if (!lamp) throw new Error('missing lamp');
    press(lamp);
    expect(document.documentElement.dataset.colorScheme).toBe('light');
    expect(options()).toEqual([]);
    wait(SETTLE_MS);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    press(lamp);
    expect(document.documentElement.dataset.colorScheme).toBe('dark');
  });

  it('stays open when the letter itself is pressed', () => {
    const { query, press, options, open } = showDesk();
    open();
    const card = query('.envelope-card');
    if (!card) throw new Error('missing letter');
    press(card);
    expect(options()).toHaveLength(3);
  });

  it('puts the letter away on Escape and returns focus to the envelope', () => {
    const { trigger, options, open } = showDesk();
    open();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(options()).toEqual([]);
    expect(document.activeElement).toBe(trigger);
  });

  it('opens again as soon as it lands, ready to be used once more', () => {
    const { query, trigger, wait, press, options, open } = showDesk();
    open();
    press(document.body);
    wait(SETTLE_MS);
    expect(trigger.getAttribute('aria-disabled')).toBe('false');
    expect(query('.envelope-flap')?.getAttribute('data-side')).toBe('inside');
    open();
    expect(options()).toHaveLength(3);
  });

  it('can be picked up again while it is still opening', () => {
    const { trigger, wait, press, options, open } = showDesk();
    open();
    press(document.body);
    wait(1500);
    expect(trigger.getAttribute('aria-disabled')).toBe('false');
    open();
    expect(options()).toHaveLength(3);
  });

  it('puts the letter away when the page scrolls', () => {
    const { trigger, wait, options, open } = showDesk();
    open();
    act(() => {
      window.scrollTo(0, 200);
      window.dispatchEvent(new Event('scroll'));
    });
    expect(options()).toEqual([]);
    expect(document.activeElement).toBe(trigger);
    wait(SETTLE_MS);
    expect(trigger.getAttribute('aria-disabled')).toBe('false');
  });

  it('moves at once when the reader prefers reduced motion', () => {
    const { trigger, press, options } = showDesk('reduced');
    press(trigger);
    expect(options()).toHaveLength(3);
    press(document.body);
    expect(options()).toEqual([]);
    expect(trigger.getAttribute('aria-disabled')).toBe('false');
  });
});
