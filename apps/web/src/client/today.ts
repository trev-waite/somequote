import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PublicationDto } from '../shared/api-contract';
import { fetchTodayPublication } from './api';

const QUOTE_FONT = '400 1em "Instrument Serif"';
const FONT_WAIT_LIMIT_MS = 3000;

type TodayState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly publication: PublicationDto }
  | { readonly kind: 'failed' };

export function quoteFontReady(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return Promise.resolve();
  const loaded = document.fonts.load(QUOTE_FONT).then(
    () => undefined,
    () => undefined,
  );
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, FONT_WAIT_LIMIT_MS);
    loaded.then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

// Poll for about an hour, backing off to stay below the API rate limit.
const ROLLOVER_RETRY_MS = [2000, 5000, 10_000, 30_000, 60_000] as const;
const ROLLOVER_ATTEMPTS = 70;

/** `rollOver` trusts the server's date, not the device clock, which may reach midnight first. */
export function useTodayPublication(load = fetchTodayPublication) {
  const [state, setState] = useState<TodayState>({ kind: 'loading' });
  const shown = useRef<PublicationDto | undefined>(undefined);
  const inFlight = useRef<AbortController | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const restart = useCallback(() => {
    inFlight.current?.abort();
    clearTimeout(timer.current);
    const controller = new AbortController();
    inFlight.current = controller;
    return controller.signal;
  }, []);

  const retry = useCallback(() => {
    const signal = restart();
    setState({ kind: 'loading' });
    Promise.all([load(signal), quoteFontReady()]).then(
      ([publication]) => {
        if (signal.aborted) return;
        shown.current = publication;
        setState({ kind: 'ready', publication });
      },
      () => {
        if (!signal.aborted) setState({ kind: 'failed' });
      },
    );
  }, [load, restart]);

  const rollOver = useCallback(() => {
    const previous = shown.current;
    if (!previous) {
      retry();
      return;
    }
    const signal = restart();
    const attempt = (index: number) => {
      const later = () => {
        if (signal.aborted || index + 1 >= ROLLOVER_ATTEMPTS) return;
        const delay = ROLLOVER_RETRY_MS[Math.min(index, ROLLOVER_RETRY_MS.length - 1)];
        timer.current = setTimeout(() => attempt(index + 1), delay);
      };
      load(signal, { fresh: true }).then((publication) => {
        if (signal.aborted) return;
        if (publication.date <= previous.date) {
          later();
          return;
        }
        shown.current = publication;
        setState({ kind: 'ready', publication });
      }, later);
    };
    attempt(0);
  }, [load, restart, retry]);

  useEffect(() => {
    retry();
    return () => {
      inFlight.current?.abort();
      clearTimeout(timer.current);
    };
  }, [retry]);

  return { state, retry, rollOver };
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function subscribeToMotionPreference(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToMotionPreference,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}
