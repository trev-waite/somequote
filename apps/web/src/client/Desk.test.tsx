import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CORD } from './cord';
import { Desk } from './Desk';
import { CORD_ANCHOR } from './desk-geometry';
import { preferReducedMotion, render } from './test-render';

let cleanup: (() => void) | undefined;

beforeEach(() => {
  preferReducedMotion(false);
  document.documentElement.dataset.colorScheme = 'light';
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup?.();
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
  delete document.documentElement.dataset.colorScheme;
});

function showDesk(pointerType = 'mouse') {
  const view = render(<Desk remainingMs={100_000} motion="full" />);
  cleanup = view.unmount;
  const svg = view.container.querySelector('svg');
  const zone = view.container.querySelector<HTMLSpanElement>('.lamp-cord-zone');
  const pull = view.container.querySelector('.lamp-pull');
  if (!svg || !zone || !pull) throw new Error('missing lamp');
  vi.spyOn(svg, 'getScreenCTM').mockReturnValue(new DOMMatrix());

  const pointer = (type: string, distance = 0) =>
    act(() => {
      zone.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          pointerType,
          button: 0,
          clientX: CORD_ANCHOR.x,
          clientY: CORD_ANCHOR.y + CORD.length + distance,
        }),
      );
    });
  const click = () => act(() => zone.click());
  const pullY = () => {
    const position = pull.getAttribute('transform')?.match(/^translate\(\S+ (\S+)\)/);
    if (!position?.[1]) throw new Error('missing pull position');
    return Number(position[1]);
  };
  return { pointer, click, pullY };
}

describe('Desk cord', () => {
  it.each(['mouse', 'touch'])('pulls down on a %s tap and switches only once', (pointerType) => {
    const { pointer, click, pullY } = showDesk(pointerType);
    const restingY = pullY();
    pointer('pointerdown');
    pointer('pointerup');
    expect(document.documentElement.dataset.colorScheme).toBe('dark');
    click();
    expect(document.documentElement.dataset.colorScheme).toBe('dark');

    act(() => vi.advanceTimersByTime(100));
    expect(pullY()).toBeGreaterThan(restingY);
    expect(pullY()).toBeLessThan(restingY + CORD.switchAt);
    act(() => vi.advanceTimersByTime(CORD.tug.seconds * 1000 - 100 + 20));
    expect(pullY()).toBeGreaterThan(restingY + CORD.switchAt);
  });

  it('keeps a cancelled press from activating the lamp', () => {
    const { pointer, click } = showDesk('touch');
    pointer('pointerdown');
    pointer('pointercancel');
    click();
    expect(document.documentElement.dataset.colorScheme).toBe('light');
  });

  it('releases a lost pointer capture so the next tap works', () => {
    const { pointer } = showDesk();
    pointer('pointerdown');
    pointer('lostpointercapture');
    expect(document.documentElement.dataset.colorScheme).toBe('light');
    pointer('pointerdown');
    pointer('pointerup');
    expect(document.documentElement.dataset.colorScheme).toBe('dark');
  });

  it('does not switch again when a real pull ends with a click', () => {
    const { pointer, click } = showDesk();
    pointer('pointerdown');
    pointer('pointermove', CORD.switchAt * 3);
    expect(document.documentElement.dataset.colorScheme).toBe('dark');
    pointer('pointermove', CORD.switchAt * 4);
    pointer('pointerup', CORD.switchAt * 4);
    click();
    expect(document.documentElement.dataset.colorScheme).toBe('dark');
  });
});
