import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Desk } from './Desk';
import { DRAWER, drawerDrawingAt } from './drawer-geometry';
import type { Motion } from './reveal';
import { preferReducedMotion, render } from './test-render';

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

function showDrawer(motion: Motion) {
  const view = render(<Desk remainingMs={100_000} motion={motion} quote={undefined} />);
  cleanup = view.unmount;
  const handle = view.container.querySelector<HTMLButtonElement>('.drawer-handle');
  const drawer = view.container.querySelector('.drawer');
  if (!handle || !drawer) throw new Error('missing drawer');
  return {
    handle,
    drawer,
    click: () => act(() => handle.click()),
    letter: () => view.container.querySelector('.drawer-letter')?.textContent ?? null,
    wait: (ms: number) => act(() => vi.advanceTimersByTime(ms)),
  };
}

describe('Drawer', () => {
  it('slides open on a letter, and shuts on the next click', () => {
    const { handle, drawer, click, letter, wait } = showDrawer('full');
    expect(letter()).toBeNull();
    click();
    expect(handle.getAttribute('aria-expanded')).toBe('true');
    wait(DRAWER.openMs / 2);
    expect(drawer.hasAttribute('data-moving')).toBe(true);
    wait(DRAWER.openMs);
    expect(drawer.hasAttribute('data-moving')).toBe(false);
    expect(letter()).toBe(DRAWER.letter.text);
    expect(handle.getAttribute('aria-label')).toBe('Close the desk drawer');
    click();
    expect(handle.getAttribute('aria-expanded')).toBe('false');
    wait(DRAWER.closeMs + 50);
    expect(letter()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('turns back part way when clicked again while opening', () => {
    const { click, letter, wait } = showDrawer('full');
    click();
    wait(DRAWER.openMs * 0.4);
    click();
    wait(DRAWER.closeMs * 0.8);
    expect(letter()).toBeNull();
  });

  it('opens and shuts at once with reduced motion', () => {
    const { click, letter } = showDrawer('reduced');
    click();
    expect(letter()).toBe(DRAWER.letter.text);
    click();
    expect(letter()).toBeNull();
  });

  it('shows the whole letter once open, and its control covers the open drawer', () => {
    const shut = drawerDrawingAt(0);
    const open = drawerDrawingAt(1);
    expect(shut.letter).toBeUndefined();
    expect(open.letter?.parts.some((part) => part.kind === 'writing')).toBe(true);
    expect(open.area.box.height).toBeGreaterThan(shut.area.box.height + DRAWER.travel / 3);
  });
});
