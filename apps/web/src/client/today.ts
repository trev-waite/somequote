import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { PublicationDto } from '../shared/api-contract';
import { fetchTodayPublication } from './api';

export const QUOTE_FONT = '400 1em "Instrument Serif"';
const FONT_WAIT_LIMIT_MS = 3000;

export type TodayState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly publication: PublicationDto }
  | { readonly kind: 'failed' };

/** Resolves once the quote font can render, or after a short limit so a slow font never blocks the quote. */
export function quoteFontReady(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return Promise.resolve();
  const loaded = document.fonts.load(QUOTE_FONT).then(
    () => undefined,
    () => undefined,
  );
  const limit = new Promise<void>((resolve) => setTimeout(resolve, FONT_WAIT_LIMIT_MS));
  return Promise.race([loaded, limit]);
}

/**
 * Today's publication, revealed only when both the data and the quote font are ready, so the
 * words are laid out once, in their final typeface, before any of them animate.
 */
export function useTodayPublication(load = fetchTodayPublication) {
  const [state, setState] = useState<TodayState>({ kind: 'loading' });

  const request = useCallback(
    (signal: AbortSignal) => {
      Promise.all([load(signal), quoteFontReady()]).then(
        ([publication]) => {
          if (!signal.aborted) setState({ kind: 'ready', publication });
        },
        () => {
          if (!signal.aborted) setState({ kind: 'failed' });
        },
      );
    },
    [load],
  );

  useEffect(() => {
    const controller = new AbortController();
    request(controller.signal);
    return () => controller.abort();
  }, [request]);

  const retry = useCallback(() => {
    setState({ kind: 'loading' });
    request(new AbortController().signal);
  }, [request]);

  return { state, retry };
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
