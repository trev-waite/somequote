import { describe, expect, it } from 'vitest';
import { attributionUrl } from './attributions';
import { COLLECTION } from './collection';

describe('attribution links', () => {
  it('links every curated quote to a Grokipedia article', () => {
    for (const { quote } of COLLECTION) {
      const url = attributionUrl(quote);
      expect(url, quote.id).toBeDefined();
      const parsed = new URL(url ?? '');
      expect(parsed.origin).toBe('https://grokipedia.com');
      expect(parsed.pathname).toMatch(/^\/page\/[^/]+$/);
      expect(parsed.search).toBe('');
      expect(parsed.hash).toBe('');
    }
  });

  it.each([
    ['James Allen', 'James_Allen_(author)'],
    ['L. M. Montgomery', 'Lucy_Maud_Montgomery'],
    ['Seneca', 'Seneca_the_Younger'],
    ['Kimi Räikkönen', 'Kimi_Räikkönen'],
  ])('uses the curated entry for %s', (author, page) => {
    expect(attributionUrl({ category: 'general', author })).toBe(
      `https://grokipedia.com/page/${page}`,
    );
  });

  it.each([
    ['Psalm 23:1', 'Psalms'],
    ['1 Corinthians 13:4–7', 'First_Epistle_to_the_Corinthians'],
    ['Song of Solomon 8:7', 'Song_of_Songs'],
  ])('links %s to the book it cites', (reference, page) => {
    expect(attributionUrl({ category: 'bible', reference })).toBe(
      `https://grokipedia.com/page/${page}`,
    );
  });

  it.each(['Unknown Author', 'constructor', '__proto__'])(
    'does not invent a link for %s',
    (author) => {
      expect(attributionUrl({ category: 'general', author })).toBeUndefined();
    },
  );
});
