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

/** Long enough for the envelope to finish any move, including landing and opening again. */
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
  return { query, trigger, wait, press, options, optionElements, open };
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
    const { query, options, optionElements, open } = showDesk();
    open();
    await act(async () => optionElements()[0]?.click());
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/`);
    expect(options()[0]).toBe('Link copied');
    expect(query('[role="status"]')?.textContent).toBe('Link copied');
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
