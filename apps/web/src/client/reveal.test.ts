import { describe, expect, it } from 'vitest';
import { planReveal, REVEAL, tokenize } from './reveal';

describe('planReveal', () => {
  it('starts each word 80ms after the previous one and lets each rise for 400ms', () => {
    const plan = planReveal(5, 'full');
    if (plan.kind !== 'cascade') throw new Error('expected a cascade');

    expect(plan.words).toEqual(
      [0, 80, 160, 240, 320].map((delayMs) => ({ delayMs, durationMs: 400 })),
    );
  });

  it('fades the attribution in, over 450ms, only once the last word has finished', () => {
    for (const wordCount of [1, 2, 7, 18, 60]) {
      const plan = planReveal(wordCount, 'full');
      if (plan.kind !== 'cascade') throw new Error('expected a cascade');
      const lastWord = plan.words.at(-1);
      if (!lastWord) throw new Error('expected words');

      expect(plan.attribution.delayMs).toBe(lastWord.delayMs + lastWord.durationMs);
      expect(plan.attribution.durationMs).toBe(450);
    }
  });

  it('overlaps words so the cascade feels continuous', () => {
    const plan = planReveal(10, 'full');
    if (plan.kind !== 'cascade') throw new Error('expected a cascade');

    for (let index = 1; index < plan.words.length; index++) {
      const previous = plan.words[index - 1];
      const current = plan.words[index];
      if (!previous || !current) throw new Error('missing word timing');
      expect(current.delayMs).toBeLessThan(previous.delayMs + previous.durationMs);
      expect(current.delayMs).toBeGreaterThan(previous.delayMs);
    }
  });

  it('tightens the stagger for long quotes so the reveal never drags', () => {
    const plan = planReveal(64, 'full');
    if (plan.kind !== 'cascade') throw new Error('expected a cascade');

    expect(plan.words.at(-1)?.delayMs).toBeLessThanOrEqual(REVEAL.maxCascadeMs);
    expect(plan.attribution.delayMs).toBeLessThanOrEqual(
      REVEAL.maxCascadeMs + REVEAL.wordDurationMs,
    );
  });

  it('replaces motion with a single gentle fade when motion is reduced', () => {
    expect(planReveal(12, 'reduced')).toEqual({
      kind: 'fade',
      fade: { delayMs: 0, durationMs: REVEAL.reducedFadeMs },
    });
  });
});

describe('tokenize', () => {
  it('keeps punctuation with its word and numbers the words in reading order', () => {
    expect(tokenize('Love all, trust a few.')).toEqual([
      { kind: 'word', text: 'Love', index: 0 },
      { kind: 'space' },
      { kind: 'word', text: 'all,', index: 1 },
      { kind: 'space' },
      { kind: 'word', text: 'trust', index: 2 },
      { kind: 'space' },
      { kind: 'word', text: 'a', index: 3 },
      { kind: 'space' },
      { kind: 'word', text: 'few.', index: 4 },
    ]);
  });

  it('turns newlines into line breaks and collapses runs of spaces', () => {
    expect(tokenize('Love all,\nDo  wrong').map((token) => token.kind)).toEqual([
      'word',
      'space',
      'word',
      'line-break',
      'word',
      'space',
      'word',
    ]);
  });
});
