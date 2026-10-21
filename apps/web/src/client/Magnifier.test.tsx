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
  const desk = view.container.querySelector('svg');
  const layer = view.container.querySelector<HTMLDivElement>('.magnifier-layer');
  const grip = view.container.querySelector<HTMLButtonElement>('.magnifier-grip');
  if (!desk || !layer || !grip) throw new Error('missing magnifying glass');
  // Client pixels are drawing units, so pointer positions can be given in the drawing's terms.
  vi.spyOn(desk, 'getScreenCTM').mockReturnValue(new DOMMatrix());
  const pointer = (type: string, x: number, y: number) =>
    act(() => {
      grip.dispatchEvent(
        new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientX: x, clientY: y }),
      );
    });
  const lens = () => {
    const shown = view.container.querySelector<HTMLElement>('.magnifier-lens');
    const [x, y] = (shown?.dataset.center ?? '').split(' ').map(Number);
    if (!shown || x === undefined || y === undefined) throw new Error('missing lens');
    return { x, y, magnification: Number(shown.dataset.magnification) };
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
    expect(container.querySelector('.magnifier-lens use[href="#desk-body"]')).not.toBeNull();
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

  it('eases the lens into view as the glass approaches, then settles completely', () => {
    const { container, pointer, wait } = showGlass();
    const opacity = () =>
      Number(container.querySelector<HTMLElement>('.magnifier-lens')?.style.opacity);
    pointer('pointerdown', REST_LENS.x, REST_LENS.y);
    pointer('pointerup', REST_LENS.x, REST_LENS.y);

    wait(MAGNIFIER.liftMs / 4);
    const early = opacity();
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(0.25);
    wait(MAGNIFIER.liftMs / 4);
    const middle = opacity();
    expect(middle).toBeGreaterThan(early);
    expect(middle - early).toBeGreaterThan(early);
    wait(MAGNIFIER.liftMs / 4);
    const late = opacity();
    expect(late).toBeGreaterThan(0.75);
    expect(late).toBeLessThan(1);
    wait(MAGNIFIER.liftMs / 4 + 50);
    expect(opacity()).toBe(1);
    expect(1 - late).toBeLessThan(late - middle);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('returns from its current pose without jumping when the lift is interrupted', () => {
    const { container, pointer, raised, wait } = showGlass();
    pointer('pointerdown', REST_LENS.x, REST_LENS.y);
    pointer('pointerup', REST_LENS.x, REST_LENS.y);
    wait(MAGNIFIER.liftMs / 2);
    const edge = () => container.querySelector('.magnifier-lens-edge')?.getAttribute('d');
    const before = edge();
    const opacity = container.querySelector<HTMLElement>('.magnifier-lens')?.style.opacity;

    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));

    expect(edge()).toBe(before);
    expect(container.querySelector<HTMLElement>('.magnifier-lens')?.style.opacity).toBe(opacity);
    wait(MAGNIFIER.dropMs + 50);
    expect(raised()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
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
    expect(container.querySelector('svg')?.querySelector('.magnifier')).not.toBeNull();
    expect(grip.style.cssText).toBe(resting);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('moves a raised glass without redrawing it, so dragging never repaints the drawing', () => {
    const { container, pointer, lens, wait } = showGlass();
    pointer('pointerdown', REST_LENS.x, REST_LENS.y);
    pointer('pointerup', REST_LENS.x, REST_LENS.y);
    wait(MAGNIFIER.liftMs + 50);
    const edge = () => container.querySelector('.magnifier-lens-edge')?.getAttribute('d');
    const drawn = edge();
    const before = lens();

    pointer('pointerdown', before.x, before.y);
    pointer('pointermove', before.x + 12, before.y - 6);
    pointer('pointerup', before.x + 12, before.y - 6);

    expect(lens().x).toBeCloseTo(before.x + 12, 1);
    expect(lens().y).toBeCloseTo(before.y - 6, 1);
    expect(edge()).toBe(drawn);
    expect(container.querySelector<HTMLElement>('.magnifier-held')?.style.transform).toMatch(
      /^translate\(\S+%, \S+%\)$/,
    );
  });

  it('is put down by a tap anywhere else, which nothing under it receives', () => {
    const { container, pointer, held, raised, wait } = showGlass();
    pointer('pointerdown', REST_LENS.x, REST_LENS.y);
    pointer('pointerup', REST_LENS.x, REST_LENS.y);
    wait(MAGNIFIER.liftMs + 50);
    const lamp = container.querySelector<HTMLButtonElement>('.lamp-switch');

    act(() => {
      lamp?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 2 }));
      lamp?.click();
    });

    expect(held()).toBe(false);
    expect(document.documentElement.dataset.colorScheme).toBe('light');
    wait(MAGNIFIER.dropMs + 50);
    expect(raised()).toBe(false);
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
