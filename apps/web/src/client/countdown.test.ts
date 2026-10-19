import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatCountdown, useCountdown } from './countdown';
import { render } from './test-render';

const SECOND = 1000;
const HOUR = 60 * 60 * SECOND;

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
});

function Counter({ onElapsed }: { onElapsed: () => void }) {
  return createElement('output', null, formatCountdown(useCountdown(onElapsed)));
}

function showCountdown(instant: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(instant));
  const onElapsed = vi.fn();
  const view = render(createElement(Counter, { onElapsed }));
  cleanup = view.unmount;
  return {
    onElapsed,
    text: () => view.container.querySelector('output')?.textContent,
  };
}

describe('formatCountdown', () => {
  it('shows hours, minutes and seconds, rounding partial seconds up', () => {
    expect(formatCountdown(7 * HOUR + 42 * 60 * SECOND + 12.2 * SECOND)).toBe('07:42:13');
    expect(formatCountdown(1)).toBe('00:00:01');
  });

  it('covers the 25-hour day when clocks fall back', () => {
    expect(formatCountdown(25 * HOUR)).toBe('25:00:00');
  });

  it('never counts below zero', () => {
    expect(formatCountdown(-5 * SECOND)).toBe('00:00:00');
  });
});

describe('useCountdown', () => {
  it('refreshes once at Eastern midnight and starts the next countdown', () => {
    const { text, onElapsed } = showCountdown('2026-10-19T03:59:58.000Z');
    expect(text()).toBe('00:00:02');
    act(() => vi.advanceTimersByTime(1001));
    expect(text()).toBe('00:00:01');
    expect(onElapsed).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1000));
    expect(onElapsed).toHaveBeenCalledTimes(1);
    expect(text()).toBe('24:00:00');
    act(() => vi.advanceTimersByTime(2000));
    expect(text()).toBe('23:59:58');
    expect(onElapsed).toHaveBeenCalledTimes(1);
  });

  it.each([
    { instant: '2026-03-08T05:00:00.000Z', expected: '23:00:00' },
    { instant: '2026-11-01T04:00:00.000Z', expected: '25:00:00' },
  ])('follows the publication clock on the DST day starting $instant', ({ instant, expected }) => {
    expect(showCountdown(instant).text()).toBe(expected);
  });

  it('catches up once when a sleeping tab resumes days later', () => {
    const { text, onElapsed } = showCountdown('2026-10-19T03:59:58.000Z');
    vi.setSystemTime(new Date('2026-10-22T12:00:00.000Z'));
    act(() => vi.advanceTimersByTime(1001));
    expect(onElapsed).toHaveBeenCalledTimes(1);
    expect(text()).toBe('15:59:59');
  });

  it('cancels the next tick when unmounted', () => {
    const { onElapsed } = showCountdown('2026-10-19T03:59:58.000Z');
    cleanup?.();
    cleanup = undefined;
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(5000));
    expect(onElapsed).not.toHaveBeenCalled();
  });
});
