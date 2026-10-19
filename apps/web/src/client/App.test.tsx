import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicationDto } from '../shared/api-contract';
import { App } from './App';
import { TodayQuoteUnavailableError } from './api';
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
