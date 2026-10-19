import { useEffect, useRef, useState } from 'react';
import { nextPublicationAt } from '../shared/schedule';

const SECOND_MS = 1000;

/** Whole hours, minutes and seconds left, rounding partial seconds up and never below zero. */
export function countdownParts(remainingMs: number): {
  hours: number;
  minutes: number;
  seconds: number;
} {
  const total = Math.max(0, Math.ceil(remainingMs / SECOND_MS));
  return {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/** `HH:MM:SS` until the next publication. Days can be 23 or 25 hours long, never more. */
export function formatCountdown(remainingMs: number): string {
  const { hours, minutes, seconds } = countdownParts(remainingMs);
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

/**
 * Milliseconds until the next quote, re-rendered on each whole second. `onElapsed` runs once the
 * next quote is due, and the countdown moves on to the publication after it.
 */
export function useCountdown(onElapsed: () => void, now: () => number = Date.now): number {
  const [target, setTarget] = useState(() => nextPublicationAt(new Date(now())).getTime());
  const [remaining, setRemaining] = useState(() => target - now());
  const elapsed = useRef(onElapsed);
  elapsed.current = onElapsed;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const left = target - now();
      if (left <= 0) {
        elapsed.current();
        setTarget(nextPublicationAt(new Date(now())).getTime());
        return;
      }
      setRemaining(left);
      timer = setTimeout(tick, (left % SECOND_MS) + 1);
    };
    tick();
    return () => clearTimeout(timer);
  }, [target, now]);

  return remaining;
}
