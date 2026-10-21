import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicationDto } from '../shared/api-contract';
import { App } from './App';
import { type fetchTodayPublication, TodayQuoteUnavailableError } from './api';
import { preferReducedMotion, render } from './test-render';

const publication = PublicationDto.parse({
  date: '2026-10-18',
  quote: {
    category: 'general',
    id: 'thoreau-morning-star',
    text: 'There is more day to dawn. The sun is but a morning star.',
    author: 'Henry David Thoreau',
    source: 'Walden',
  },
});

let cleanup: (() => void) | undefined;
beforeEach(() => preferReducedMotion(false));
afterEach(() => cleanup?.());

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('App', () => {
  it('waits for the quote before revealing its text and attribution', async () => {
    let resolve: (value: PublicationDto) => void = () => undefined;
    const load = vi.fn(() => new Promise<PublicationDto>((done) => (resolve = done)));
    const view = render(<App load={load} />);
    cleanup = view.unmount;

    expect(view.container.querySelector('main')?.getAttribute('aria-busy')).toBe('true');
    expect(view.container.querySelector('blockquote')).toBeNull();

    resolve(publication);
    await settle();

    expect(view.container.querySelector('main')?.getAttribute('aria-busy')).toBe('false');
    expect(view.container.querySelector('time')).toBeNull();
    expect(view.container.querySelector('blockquote .visually-hidden')?.textContent).toBe(
      `“${publication.quote.text}”`,
    );
    expect(view.container.querySelector('figcaption')?.textContent).toContain(
      'Henry David Thoreau',
    );
  });

  it('names the site for assistive technology through the logo', () => {
    const view = render(<App load={() => new Promise(() => undefined)} />);
    cleanup = view.unmount;

    expect(view.container.querySelector('h1 svg')?.getAttribute('aria-label')).toBe('SomeQuote');
  });

  it('uses the reduced-motion reveal when the reader prefers it', async () => {
    preferReducedMotion(true);
    const view = render(<App load={async () => publication} />);
    cleanup = view.unmount;
    await settle();

    expect(view.container.querySelector('article')?.getAttribute('data-motion')).toBe('fade');
  });

  it('switches between light and dark mode from the lamp', () => {
    const view = render(<App load={() => new Promise(() => undefined)} />);
    cleanup = view.unmount;
    const lamp = () => view.container.querySelector<HTMLButtonElement>('.lamp-switch');
    const before = document.documentElement.dataset.colorScheme ?? 'light';

    act(() => lamp()?.click());

    expect(document.documentElement.dataset.colorScheme).toBe(
      before === 'light' ? 'dark' : 'light',
    );
    expect(lamp()?.getAttribute('aria-label')).toContain(
      before === 'light' ? 'light mode' : 'dark mode',
    );
  });

  it('counts down to the next quote', () => {
    const view = render(<App load={() => new Promise(() => undefined)} />);
    cleanup = view.unmount;

    expect(view.container.querySelector('[role="timer"]')?.textContent).toMatch(
      /^\d{2}:\d{2}:\d{2} until the next quote$/,
    );
  });

  it('keeps checking past midnight until the server has published the next quote', async () => {
    vi.useFakeTimers();
    try {
      // 23:59:50 in New York on 2026-10-18, by this device's clock.
      vi.setSystemTime(new Date('2026-10-19T03:59:50Z'));
      const next = PublicationDto.parse({
        date: '2026-10-19',
        quote: { ...publication.quote, id: 'next-quote', text: 'A new day.' },
      });
      // The device clock runs ahead of the server's, so the first check still gets yesterday.
      const load = vi
        .fn<typeof fetchTodayPublication>()
        .mockResolvedValueOnce(publication)
        .mockResolvedValueOnce(publication)
        .mockRejectedValueOnce(new TodayQuoteUnavailableError('offline'))
        .mockResolvedValueOnce(next);
      const view = render(<App load={load} />);
      cleanup = view.unmount;
      const shownText = () =>
        view.container.querySelector('blockquote .visually-hidden')?.textContent;
      const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

      await advance(3000);
      expect(shownText()).toBe(`“${publication.quote.text}”`);

      await advance(7100);
      expect(load).toHaveBeenCalledTimes(2);
      expect(load).toHaveBeenLastCalledWith(expect.any(AbortSignal), { fresh: true });
      expect(shownText()).toBe(`“${publication.quote.text}”`);

      await advance(2000);
      expect(load).toHaveBeenCalledTimes(3);
      expect(shownText()).toBe(`“${publication.quote.text}”`);
      expect(view.container.querySelector('[role="alert"]')).toBeNull();

      await advance(5000);
      expect(load).toHaveBeenCalledTimes(4);
      expect(shownText()).toBe('“A new day.”');
    } finally {
      vi.useRealTimers();
    }
  });

  it('offers a retry when the quote cannot be loaded, and recovers', async () => {
    const load = vi
      .fn<() => Promise<PublicationDto>>()
      .mockRejectedValueOnce(new TodayQuoteUnavailableError('offline'))
      .mockResolvedValueOnce(publication);
    const view = render(<App load={load} />);
    cleanup = view.unmount;
    await settle();

    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain(
      'couldn’t be loaded',
    );

    act(() => view.container.querySelector('button')?.click());
    await settle();

    expect(view.container.querySelector('[role="alert"]')).toBeNull();
    expect(view.container.querySelector('blockquote')).not.toBeNull();
  });
});
