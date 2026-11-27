import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicationDto } from '../../shared/api-contract';
import { PublicationView } from '../publication/Publication';
import { render } from '../test-render';
import { currentFavorites, FAVORITES_KEY, parseFavorites } from './favorites';

const publication: PublicationDto = PublicationDto.parse({
  date: '2026-11-24',
  quote: { category: 'general', id: 'today', text: 'Today.', author: 'A', source: 'S' },
});

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  vi.restoreAllMocks();
  localStorage.setItem(FAVORITES_KEY, '[]');
  currentFavorites();
  localStorage.clear();
});

function showQuote() {
  const view = render(<PublicationView publication={publication} motion="reduced" />);
  cleanup = view.unmount;
  const toggle = view.container.querySelector<HTMLButtonElement>('.favorite-toggle');
  if (!toggle) throw new Error('missing toggle');
  return { view, toggle, press: () => act(() => toggle.click()) };
}

describe('FavoriteToggle', () => {
  it('keeps today’s quote on this device, and lets it go', () => {
    const { view, toggle, press } = showQuote();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Favorite');
    press();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(parseFavorites(localStorage.getItem(FAVORITES_KEY))).toEqual([publication]);
    expect(view.container.querySelector('[role="status"]')?.textContent).toMatch(/card box/);
    press();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(parseFavorites(localStorage.getItem(FAVORITES_KEY))).toEqual([]);
  });

  it('says when this browser refuses to save a favorite', () => {
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    try {
      const { view, toggle, press } = showQuote();
      press();
      expect(toggle.getAttribute('aria-pressed')).toBe('true');
      expect(view.container.querySelector('[role="status"]')?.textContent).toMatch(
        /for this visit only/,
      );
    } finally {
      setItem.mockRestore();
    }
  });

  it('shows a favorite kept earlier, or in another tab', () => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([publication]));
    const { toggle } = showQuote();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    act(() => {
      localStorage.removeItem(FAVORITES_KEY);
      window.dispatchEvent(new StorageEvent('storage', { key: FAVORITES_KEY }));
    });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });
});
