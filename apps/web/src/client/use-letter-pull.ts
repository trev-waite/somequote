import {
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { VIEW_BOX } from './desk-geometry';
import type { Motion } from './reveal';

interface Pull {
  readonly pointerId: number;
  readonly target: HTMLElement;
  readonly startY: number;
  readonly scale: number;
  readonly startOffset: number;
  offset: number;
  y: number;
  time: number;
  velocity: number;
  distance: number;
  moved: boolean;
}

/** Pointer capture and a damped spring let the letter stretch without moving the page. */
export function useLetterPull(motion: Motion, enabled: boolean) {
  const [offset, setOffset] = useState(0);
  const [ready, setReady] = useState(false);
  const pull = useRef<Pull | null>(null);
  const frame = useRef(0);
  const offsetRef = useRef(0);
  offsetRef.current = offset;
  const ignoreClickUntil = useRef(0);

  const reset = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    const active = pull.current;
    pull.current = null;
    if (active?.target.hasPointerCapture?.(active.pointerId)) {
      active.target.releasePointerCapture(active.pointerId);
    }
    setOffset(0);
    setReady(false);
  }, []);

  useEffect(() => {
    if (!enabled) reset();
    return () => cancelAnimationFrame(frame.current);
  }, [enabled, reset]);

  const release = (event: PointerEvent<HTMLElement>) => {
    const active = pull.current;
    if (!active || active.pointerId !== event.pointerId) return;
    pull.current = null;
    if (active.target.hasPointerCapture?.(event.pointerId)) {
      active.target.releasePointerCapture(event.pointerId);
    }
    if (!active.moved) {
      setOffset(0);
      return;
    }
    ignoreClickUntil.current = performance.now() + 400;
    if (
      event.type === 'pointerup' &&
      (active.distance >= 12 || (active.distance > 4 && active.velocity > 0.35))
    ) {
      setReady(true);
    }
    if (motion === 'reduced') {
      setOffset(0);
      return;
    }
    const from = active.offset;
    const velocity =
      performance.now() - active.time > 80 || active.distance === 0
        ? 0
        : Math.max(-30, Math.min(30, (active.velocity * 1000) / active.scale));
    const started = performance.now();
    const tick = (now: number) => {
      const t = (now - started) / 1000;
      if (t >= 0.75) {
        frame.current = 0;
        setOffset(0);
        return;
      }
      setOffset(
        Math.exp(-9 * t) *
          (from * Math.cos(15 * t) + ((velocity + 9 * from) / 15) * Math.sin(15 * t)),
      );
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };

  return {
    offset,
    ready,
    reveal: () => setReady(true),
    reset,
    handlers: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (!enabled || event.button !== 0 || pull.current) return;
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (!target || target.closest('.envelope-option')) return;
        cancelAnimationFrame(frame.current);
        const capture = target.closest<HTMLElement>('.envelope-pull') ?? event.currentTarget;
        const width = event.currentTarget.closest('.desk')?.getBoundingClientRect().width;
        pull.current = {
          pointerId: event.pointerId,
          target: capture,
          startY: event.clientY,
          scale: width ? width / VIEW_BOX.width : 1,
          startOffset: offsetRef.current,
          offset: offsetRef.current,
          y: event.clientY,
          time: performance.now(),
          velocity: 0,
          distance: 0,
          moved: false,
        };
        capture.setPointerCapture?.(event.pointerId);
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        const active = pull.current;
        if (!active || active.pointerId !== event.pointerId) return;
        const now = performance.now();
        active.velocity = (active.y - event.clientY) / Math.max(1, now - active.time);
        active.y = event.clientY;
        active.time = now;
        active.distance = Math.max(0, (active.startY - event.clientY) / active.scale);
        active.moved ||= Math.abs(active.startY - event.clientY) > 4;
        if (active.moved) event.preventDefault();
        active.offset =
          active.startOffset + (10 - active.startOffset) * (1 - Math.exp(-active.distance / 10));
        setOffset(active.offset);
      },
      onPointerUp: release,
      onPointerCancel: release,
      onLostPointerCapture: release,
      onClickCapture: (event: MouseEvent<HTMLElement>) => {
        if (performance.now() >= ignoreClickUntil.current) return;
        event.preventDefault();
        event.stopPropagation();
      },
    },
  };
}
