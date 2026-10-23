import {
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { Motion } from '../../publication/reveal';
import { VIEW_BOX } from '../desk-geometry';
import { ENVELOPE, LETTER_EXTENSION } from './envelope-pose';

interface Pull {
  readonly pointerId: number;
  readonly target: HTMLElement;
  readonly startY: number;
  readonly scale: number;
  readonly startOffset: number;
  readonly startedExpanded: boolean;
  y: number;
  time: number;
  screenVelocity: number;
  moved: boolean;
}

const resist = (offset: number) => {
  const stretch = (distance: number) => 2.5 * (1 - Math.exp(-distance / 5));
  if (offset < 0) return -stretch(-offset);
  if (offset > LETTER_EXTENSION) return LETTER_EXTENSION + stretch(offset - LETTER_EXTENSION);
  return offset;
};

export function useLetterPull(
  motion: Motion,
  enabled: boolean,
  onCollapse: (offset: number) => void,
) {
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const pull = useRef<Pull | null>(null);
  const frame = useRef(0);
  const position = useRef({ offset: 0, velocity: 0 });
  const destination = useRef(0);
  const ignoreClickUntil = useRef(0);

  const reset = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    const active = pull.current;
    pull.current = null;
    if (active?.target.hasPointerCapture?.(active.pointerId)) {
      active.target.releasePointerCapture(active.pointerId);
    }
    position.current = { offset: 0, velocity: 0 };
    destination.current = 0;
    setOffset(0);
    setExpanded(false);
  }, []);

  useEffect(() => {
    if (!enabled) reset();
    return () => cancelAnimationFrame(frame.current);
  }, [enabled, reset]);

  const settle = (target: number) => {
    cancelAnimationFrame(frame.current);
    destination.current = target;
    setExpanded(target === LETTER_EXTENSION);
    if (motion === 'reduced') {
      position.current = { offset: target, velocity: 0 };
      setOffset(target);
      return;
    }
    const displacement = position.current.offset - target;
    const velocity = Math.max(-60, Math.min(60, position.current.velocity));
    if (Math.abs(displacement) < 0.001 && Math.abs(velocity) < 0.001) {
      frame.current = 0;
      position.current = { offset: target, velocity: 0 };
      setOffset(target);
      return;
    }
    const sine = (velocity + 10 * displacement) / 18;
    const started = performance.now();
    const tick = (now: number) => {
      const t = (now - started) / 1000;
      if (t >= 0.75) {
        frame.current = 0;
        position.current = { offset: target, velocity: 0 };
        setOffset(target);
        return;
      }
      const decay = Math.exp(-10 * t);
      const cos = Math.cos(18 * t);
      const sin = Math.sin(18 * t);
      position.current = {
        offset: target + decay * (displacement * cos + sine * sin),
        velocity:
          decay * ((18 * sine - 10 * displacement) * cos - (18 * displacement + 10 * sine) * sin),
      };
      setOffset(position.current.offset);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };

  const release = (event: PointerEvent<HTMLElement>) => {
    const active = pull.current;
    if (!active || active.pointerId !== event.pointerId) return;
    pull.current = null;
    if (active.target.hasPointerCapture?.(event.pointerId)) {
      active.target.releasePointerCapture(event.pointerId);
    }
    if (performance.now() - active.time > 80) {
      position.current.velocity = 0;
      active.screenVelocity = 0;
    }
    if (active.moved) ignoreClickUntil.current = performance.now() + 400;
    const down = event.clientY - active.startY;
    if (
      !active.startedExpanded &&
      active.moved &&
      event.type === 'pointerup' &&
      (down >= 18 || (down > 4 && active.screenVelocity < -0.35))
    ) {
      onCollapse(position.current.offset);
      return;
    }
    let target = destination.current;
    if (active.moved && event.type === 'pointerup') {
      target =
        Math.abs(active.screenVelocity) > 0.35
          ? active.screenVelocity > 0
            ? LETTER_EXTENSION
            : 0
          : position.current.offset > LETTER_EXTENSION / 2
            ? LETTER_EXTENSION
            : 0;
    }
    settle(target);
  };

  return {
    offset,
    expanded,
    reveal: () => settle(LETTER_EXTENSION),
    tuck: () => settle(0),
    toggle: () => settle(destination.current === 0 ? LETTER_EXTENSION : 0),
    reset,
    handlers: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (!enabled || event.button !== 0 || pull.current) return;
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (!target) return;
        cancelAnimationFrame(frame.current);
        const capture = target.closest<HTMLElement>('button, a') ?? event.currentTarget;
        const width = event.currentTarget.closest('.desk')?.getBoundingClientRect().width;
        pull.current = {
          pointerId: event.pointerId,
          target: capture,
          startY: event.clientY,
          scale:
            (width ? width / VIEW_BOX.width : 1 / ENVELOPE.lifted.scale) * ENVELOPE.lifted.scale,
          startOffset: position.current.offset,
          startedExpanded: destination.current === LETTER_EXTENSION,
          y: event.clientY,
          time: performance.now(),
          screenVelocity: 0,
          moved: false,
        };
        capture.setPointerCapture?.(event.pointerId);
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        const active = pull.current;
        if (!active || active.pointerId !== event.pointerId) return;
        const now = performance.now();
        const dt = Math.max(1, now - active.time);
        active.screenVelocity = (active.y - event.clientY) / dt;
        active.y = event.clientY;
        active.time = now;
        active.moved ||= Math.abs(active.startY - event.clientY) > 4;
        if (!active.moved) return;
        event.preventDefault();
        const next = resist(active.startOffset + (active.startY - event.clientY) / active.scale);
        position.current = {
          offset: next,
          velocity: ((next - position.current.offset) * 1000) / dt,
        };
        setOffset(next);
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
