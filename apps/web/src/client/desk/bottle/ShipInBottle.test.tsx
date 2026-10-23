import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Motion } from '../../publication/reveal';
import { preferReducedMotion, render } from '../../test-render';
import { Desk } from '../Desk';
import { BOTTLE_DURATION } from './bottle-geometry';

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

function showBottle(motion: Motion) {
  const view = render(<Desk remainingMs={100_000} motion={motion} quote={undefined} />);
  cleanup = view.unmount;
  const query = <T extends Element>(selector: string) => {
    const element = view.container.querySelector<T>(selector);
    if (!element) throw new Error(`missing ${selector}`);
    return element;
  };
  const trigger = query<HTMLButtonElement>('.bottle-trigger');
  const scene = query('.ship-in-bottle');
  return {
    container: view.container,
    knock: () => act(() => trigger.click()),
    trigger,
    stage: () => scene.getAttribute('data-stage'),
    wait: (ms: number) => act(() => vi.advanceTimersByTime(ms)),
  };
}

describe('ShipInBottle', () => {
  it('falls and cracks when knocked, then fades back onto its stand after three seconds', () => {
    const { container, knock, trigger, stage, wait } = showBottle('full');
    expect(container.querySelector('.bottle-crack')).toBeNull();
    knock();
    expect(stage()).toBe('falling');
    expect(trigger.getAttribute('aria-disabled')).toBe('true');
    wait(BOTTLE_DURATION.falling + 50);
    expect(stage()).toBe('broken');
    expect(container.querySelector('.bottle-crack')).not.toBeNull();
    expect(container.textContent).toContain('cracked');
    knock();
    wait(BOTTLE_DURATION.broken - 100);
    expect(stage()).toBe('broken');
    wait(150);
    expect(stage()).toBe('fading');
    wait(BOTTLE_DURATION.fading + 50);
    expect(stage()).toBe('returning');
    wait(BOTTLE_DURATION.returning + 50);
    expect(stage()).toBe('standing');
    expect(container.querySelector('.bottle-crack')).toBeNull();
    expect(trigger.getAttribute('aria-disabled')).toBe('false');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('skips the animation with reduced motion but still waits before returning', () => {
    const { knock, stage, wait } = showBottle('reduced');
    knock();
    expect(stage()).toBe('broken');
    wait(BOTTLE_DURATION.broken);
    expect(stage()).toBe('standing');
  });

  it('lets a click on the bottle put the share letter away first', () => {
    const { container, knock, stage } = showBottle('reduced');
    act(() => container.querySelector<HTMLButtonElement>('.envelope-trigger')?.click());
    expect(container.querySelector('.envelope-card')).not.toBeNull();
    knock();
    expect(stage()).toBe('standing');
  });
});
