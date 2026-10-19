import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlipClock, flapAngle } from './FlipClock';
import { render } from './test-render';

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  vi.useRealTimers();
});

const HOUR = 60 * 60 * 1000;

describe('flapAngle', () => {
  it('falls from the top, gathering speed, and lands flat on the bottom', () => {
    const angles = [0, 50, 100, 150, 200, 250, 299].map((ms) => flapAngle(ms).degrees);
    expect(angles[0]).toBe(0);
    for (let index = 1; index < angles.length; index++) {
      const [before, after] = [angles[index - 1] ?? 0, angles[index] ?? 0];
      expect(after).toBeGreaterThan(before);
    }
    expect(angles.at(-1)).toBeLessThanOrEqual(180);
  });

  it('bounces after landing, never past flat, and then comes to rest', () => {
    const bounce = [320, 360, 400, 440].map((ms) => flapAngle(ms));
    for (const { degrees, done } of bounce) {
      expect(degrees).toBeLessThanOrEqual(180);
      expect(done).toBe(false);
    }
    expect(Math.min(...bounce.map(({ degrees }) => degrees))).toBeLessThan(180);
    expect(flapAngle(10_000)).toEqual({ degrees: 180, done: true });
  });
});

describe('FlipClock', () => {
  it('shows hours, minutes and seconds on three cards', () => {
    const view = render(
      <svg aria-hidden="true">
        <FlipClock remainingMs={7 * HOUR + 42 * 60_000 + 12_300} motion="reduced" />
      </svg>,
    );
    cleanup = view.unmount;
    const cards = [...view.container.querySelectorAll('.flip')].map(
      (card) => card.querySelector('text')?.textContent,
    );
    expect(cards).toEqual(['07', '42', '13']);
  });

  it('changes a card at once when the reader prefers reduced motion', () => {
    const view = render(
      <svg aria-hidden="true">
        <FlipClock remainingMs={HOUR} motion="reduced" />
      </svg>,
    );
    cleanup = view.unmount;
    view.rerender(
      <svg aria-hidden="true">
        <FlipClock remainingMs={HOUR - 1000} motion="reduced" />
      </svg>,
    );
    const texts = [...view.container.querySelectorAll('.flip')].map((card) =>
      [...card.querySelectorAll('text')].slice(0, 2).map((text) => text.textContent),
    );
    expect(texts).toEqual([
      ['00', '00'],
      ['59', '59'],
      ['59', '59'],
    ]);
  });

  it('settles an animated rollover on the new digits and stops scheduling frames', () => {
    vi.useFakeTimers();
    const view = render(
      <svg aria-hidden="true">
        <FlipClock remainingMs={HOUR} motion="full" />
      </svg>,
    );
    cleanup = view.unmount;
    view.rerender(
      <svg aria-hidden="true">
        <FlipClock remainingMs={HOUR - 1000} motion="full" />
      </svg>,
    );
    act(() => vi.advanceTimersByTime(100));
    expect(view.container.querySelector('[visibility="visible"]')).not.toBeNull();

    act(() => vi.advanceTimersByTime(500));
    const cards = [...view.container.querySelectorAll('.flip')].map((card) =>
      [...card.querySelectorAll('text')].slice(0, 2).map((text) => text.textContent),
    );
    expect(cards).toEqual([
      ['00', '00'],
      ['59', '59'],
      ['59', '59'],
    ]);
    expect(view.container.querySelector('[visibility="visible"]')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
