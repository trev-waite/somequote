/** Motion design for the quote reveal. All timing lives here; CSS supplies only the keyframes. */
export const REVEAL = {
  durationMs: 650,
  staggerMs: 80,
  /** Long quotes tighten the stagger so the last word starts within this window. */
  maxCascadeMs: 2400,
  reducedFadeMs: 300,
} as const;

export type Motion = 'full' | 'reduced';

export interface Timing {
  readonly delayMs: number;
  readonly durationMs: number;
}

export type RevealPlan =
  /** Words unblur and rise in reading order; the attribution follows on the same stagger. */
  | { readonly kind: 'cascade'; readonly words: readonly Timing[]; readonly attribution: Timing }
  /** Reduced motion: nothing moves; the whole quote and its attribution fade in together. */
  | { readonly kind: 'fade'; readonly fade: Timing };

export function planReveal(wordCount: number, motion: Motion): RevealPlan {
  if (motion === 'reduced') {
    return { kind: 'fade', fade: { delayMs: 0, durationMs: REVEAL.reducedFadeMs } };
  }
  const stagger =
    wordCount > 1
      ? Math.min(REVEAL.staggerMs, REVEAL.maxCascadeMs / (wordCount - 1))
      : REVEAL.staggerMs;
  const words = Array.from({ length: wordCount }, (_, index) => ({
    delayMs: Math.round(index * stagger),
    durationMs: REVEAL.durationMs,
  }));
  return {
    kind: 'cascade',
    words,
    attribution: {
      delayMs: Math.round(wordCount * stagger),
      durationMs: REVEAL.durationMs,
    },
  };
}

export type QuoteToken =
  | { readonly kind: 'word'; readonly text: string; readonly index: number }
  | { readonly kind: 'space' }
  | { readonly kind: 'line-break' };

/** Splits a quote into words while keeping its spaces and line breaks, so wrapping stays natural. */
export function tokenize(text: string): QuoteToken[] {
  const tokens: QuoteToken[] = [];
  let index = 0;
  for (const part of text.split(/(\s+)/)) {
    if (part === '') continue;
    if (/^\s+$/.test(part)) {
      const breaks = part.split('\n').length - 1;
      if (breaks === 0) tokens.push({ kind: 'space' });
      for (let line = 0; line < breaks; line++) tokens.push({ kind: 'line-break' });
    } else {
      tokens.push({ kind: 'word', text: part, index: index++ });
    }
  }
  return tokens;
}
