import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Desk } from './Desk';
import { project, SCREEN, vec } from './iso';
import {
  clampLens,
  GRIP,
  HOVER_LENS,
  MAGNIFIER,
  magnifierDrawingAt,
  magnifierFrameAt,
  REST_LENS,
} from './magnifier-geometry';
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
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete document.documentElement.dataset.colorScheme;
});

function showGlass(motion: Motion = 'full') {
  const view = render(<Desk remainingMs={100_000} motion={motion} quote={undefined} />);
  cleanup = view.unmount;
  const layer = view.container.querySelector<SVGSVGElement>('.magnifier-layer');
  const grip = view.container.querySelector<HTMLButtonElement>('.magnifier-grip');
  if (!layer || !grip) throw new Error('missing magnifying glass');
  // Client pixels are drawing units, so pointer positions can be given in the drawing's terms.
  vi.spyOn(layer, 'getScreenCTM').mockReturnValue(new DOMMatrix());
  const pointer = (type: string, x: number, y: number) =>
    act(() => {
      grip.dispatchEvent(
        new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientX: x, clientY: y }),
      );
    });
  /** The lens's centre and magnification, read from the transform on what it shows. */
  const lens = () => {
    const zoom = view.container.querySelector('.magnifier-view')?.getAttribute('transform');
    const match = zoom?.match(/^translate\((\S+) (\S+)\) scale\((\S+)\)/);
    if (!match) throw new Error('missing lens');
    return { x: Number(match[1]), y: Number(match[2]), magnification: Number(match[3]) };
  };
  return {
    container: view.container,
    grip,
    pointer,
    lens,
    held: () => grip.getAttribute('aria-pressed') === 'true',
    raised: () => layer.querySelector('.magnifier') !== null,
    wait: (ms: number) => act(() => vi.advanceTimersByTime(ms)),
  };
}

describe('Magnifier', () => {
  it('lifts by its handle when dragged, magnifies the desk, and stays up when let go', () => {
    const { container, pointer, lens, held, raised, wait } = showGlass();
    expect(raised()).toBe(false);
    expect(container.querySelector('.magnifier-view')).toBeNull();
    pointer('pointerdown', REST_LENS.x, REST_LENS.y);
    pointer('pointermove', 20, 10);
    wait(MAGNIFIER.liftMs + 50);
    expect(held()).toBe(true);
    expect(raised()).toBe(true);
    const target = clampLens({ x: 20 - GRIP.x, y: 10 - GRIP.y });
    expect(lens().x).toBeCloseTo(target.x, 1);
    expect(lens().y).toBeCloseTo(target.y, 1);
    expect(lens().magnification).toBe(MAGNIFIER.held.magnification);
    expect(container.querySelector('.magnifier-layer use[href="#desk-scene"]')).not.toBeNull();
    pointer('pointerup', 20, 10);
    wait(500);
    expect(held()).toBe(true);
  });

  it('keeps hold of the lens where it was gripped when dragged again', () => {
    const { pointer, lens, wait } = showGlass('reduced');
    pointer('pointerdown', REST_LENS.x, REST_LENS.y);
    pointer('pointerup', REST_LENS.x, REST_LENS.y);
    const before = lens();
    pointer('pointerdown', before.x + 3, before.y + 2);
    pointer('pointermove', before.x + 13, before.y - 8);
    pointer('pointerup', before.x + 13, before.y - 8);
    wait(50);
    expect(lens().x).toBeCloseTo(before.x + 10, 1);
    expect(lens().y).toBeCloseTo(before.y - 10, 1);
  });

  it('is put down by a tap on it, and settles back on the desk', () => {
    const { container, grip, pointer, held, raised, wait, lens } = showGlass();
    const resting = grip.style.cssText;
    pointer('pointerdown', REST_LENS.x, REST_LENS.y);
    pointer('pointerup', REST_LENS.x, REST_LENS.y);
    wait(MAGNIFIER.liftMs + 50);
    expect(grip.style.cssText).not.toBe(resting);
    const { x, y } = lens();
    pointer('pointerdown', x, y);
    pointer('pointerup', x, y);
    expect(held()).toBe(false);
    wait(MAGNIFIER.dropMs + 50);
    expect(raised()).toBe(false);
    expect(container.querySelector('#desk-scene ~ g .magnifier')).not.toBeNull();
    expect(grip.style.cssText).toBe(resting);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('works from the keyboard and puts itself down on Escape', () => {
    const { grip, held, lens, wait } = showGlass('reduced');
    act(() => grip.click());
    expect(held()).toBe(true);
    expect(lens()).toMatchObject({ x: HOVER_LENS.x, y: HOVER_LENS.y });
    act(() =>
      grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })),
    );
    expect(lens().x).toBeLessThan(HOVER_LENS.x);
    act(() =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    wait(10);
    expect(held()).toBe(false);
  });
});

describe('magnifier geometry', () => {
  it('lies flat on the desk and, held, faces the reader with its lens where it is held', () => {
    const resting = magnifierFrameAt(0, HOVER_LENS);
    expect(resting.n).toEqual([0, 0, 1]);
    expect(resting.center[2]).toBeCloseTo(MAGNIFIER.thickness / 2);
    const target = { x: 12, y: -20 };
    const held = magnifierFrameAt(1, target);
    expect(vec.dot(held.n, SCREEN.out)).toBeCloseTo(1);
    expect(held.size).toBe(MAGNIFIER.held.size);
    const drawn = magnifierDrawingAt(held, 1).lens.center;
    const center = project(
      vec.add(held.center, vec.scale(held.n, (MAGNIFIER.thickness / 2) * held.size)),
    );
    expect(drawn).toEqual(center);
    expect(center.x).toBeCloseTo(target.x);
    expect(center.y).toBeCloseTo(target.y);
  });

  it('keeps the held lens over the drawing', () => {
    const far = clampLens({ x: 10_000, y: -10_000 });
    expect(far.x).toBeLessThan(10_000);
    expect(far.y).toBeGreaterThan(-10_000);
  });
});
