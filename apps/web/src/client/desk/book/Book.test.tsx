import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Motion } from '../../publication/reveal';
import { preferReducedMotion, render } from '../../test-render';
import { Desk } from '../Desk';
import { BACK_COVER, BOOK, BOOK_MIDDLE, FRONT_COVER } from './book-geometry';

let cleanup: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  preferReducedMotion(false);
  document.documentElement.dataset.colorScheme = 'light';
});
afterEach(() => {
  cleanup?.();
  vi.useRealTimers();
  delete document.documentElement.dataset.colorScheme;
});

function showBook(motion: Motion = 'reduced') {
  const view = render(<Desk remainingMs={100_000} motion={motion} quote={undefined} />);
  cleanup = view.unmount;
  const query = <T extends Element>(selector: string) => {
    const element = view.container.querySelector<T>(selector);
    if (!element) throw new Error(`missing ${selector}`);
    return element;
  };
  const book = query('.book');
  const previous = query<HTMLButtonElement>('.book-previous');
  const next = query<HTMLButtonElement>('.book-next');
  const click = (element: HTMLElement) => act(() => element.click());
  const position = () => Number(book.getAttribute('data-position'));
  const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));
  return { query, book, previous, next, click, position, wait };
}

describe('Book', () => {
  it('opens at 50/50 and turns forward and backward on the corresponding pages', () => {
    const { book, previous, next, click, position } = showBook();
    expect(position()).toBe(BOOK_MIDDLE);
    expect(book.getAttribute('data-left-height')).toBe(book.getAttribute('data-right-height'));
    click(next);
    expect(position()).toBe(BOOK_MIDDLE + 1);
    expect(Number(book.getAttribute('data-left-height'))).toBeGreaterThan(2);
    expect(Number(book.getAttribute('data-right-height'))).toBeLessThan(2);
    click(previous);
    expect(position()).toBe(BOOK_MIDDLE);
    expect(document.documentElement.dataset.colorScheme).toBe('light');
  });

  it('lifts a sheet, ignores extra clicks during its turn, and stops animating when it lands', () => {
    const { query, book, next, click, position, wait } = showBook('full');
    click(next);
    wait(200);
    expect(book.hasAttribute('data-turning')).toBe(true);
    const paintsAfter = (behind: Element, front: Element) =>
      (behind.compareDocumentPosition(front) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(paintsAfter(query('.lamp-pull'), query('.book-turning-sheet'))).toBe(true);
    expect(paintsAfter(query('.book-turning-sheet'), query('.envelope-layer'))).toBe(true);
    click(next);
    wait(BOOK.turnMs);
    expect(position()).toBe(BOOK_MIDDLE + 1);
    expect(book.hasAttribute('data-turning')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['previous', 'next'])(
    'reveals the cover after turning far enough toward %s',
    (direction) => {
      const { query, previous, next, click, position } = showBook();
      const button = direction === 'previous' ? previous : next;
      const open = direction === 'previous' ? next : previous;
      act(() => button.focus());
      for (let i = 0; i <= BOOK_MIDDLE; i++) click(button);
      expect(position()).toBe(direction === 'previous' ? FRONT_COVER : BACK_COVER);
      const title = [...query('.book-cover').querySelectorAll('text')]
        .map((t) => t.textContent)
        .join(' ');
      expect(title).toBe(BOOK.title);
      expect(
        query('.lamp-pull').compareDocumentPosition(query('.book-cover')) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(button.getAttribute('aria-disabled')).toBe('true');
      click(button);
      expect(position()).toBe(direction === 'previous' ? FRONT_COVER : BACK_COVER);
      expect(open.getAttribute('aria-label')).toBe(`Open ${BOOK.title}`);
      expect(document.activeElement).toBe(open);
      click(open);
      expect(position()).toBe(direction === 'previous' ? 0 : BOOK.leaves);
    },
  );

  it('accepts the arrow keys from either page', () => {
    const { previous, position } = showBook();
    act(() =>
      previous.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
    );
    expect(position()).toBe(BOOK_MIDDLE + 1);
    act(() =>
      previous.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })),
    );
    expect(position()).toBe(BOOK_MIDDLE);
  });

  it('lets a click on the book put the share letter away before turning a page', () => {
    const { query, next, click, position } = showBook();
    click(query<HTMLButtonElement>('.envelope-trigger'));
    expect(query('.envelope-card')).not.toBeNull();
    click(next);
    expect(position()).toBe(BOOK_MIDDLE);
    click(next);
    expect(position()).toBe(BOOK_MIDDLE + 1);
  });
});
