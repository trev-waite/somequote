import { describe, expect, it } from 'vitest';
import { QuoteDto } from '../shared/api-contract';
import { emailUrl, postOnXUrl, shareContent } from './share';

const origin = 'https://somequote.example';
const quote = QuoteDto.parse({
  category: 'general',
  id: 'thoreau-morning-star',
  text: 'There is more day to dawn. The sun is but a morning star.',
  author: 'Henry David Thoreau',
  source: 'Walden',
});

describe('shareContent', () => {
  it('shares the site with the quote and who said it', () => {
    expect(shareContent(origin, quote)).toEqual({
      url: 'https://somequote.example/',
      text: '“There is more day to dawn. The sun is but a morning star.” — Henry David Thoreau',
    });
  });

  it('cites a verse by its reference', () => {
    const verse = QuoteDto.parse({
      category: 'bible',
      id: 'psalm-118-24',
      text: 'This is the day that Yahweh has made.',
      reference: 'Psalm 118:24',
      translation: 'World English Bible',
    });
    expect(shareContent(origin, verse).text).toBe(
      '“This is the day that Yahweh has made.” — Psalm 118:24',
    );
  });

  it('falls back to a short line before the quote loads or when it would not fit in a post', () => {
    expect(shareContent(origin, undefined).text).toBe('Today’s quote on SomeQuote');
    const long = { ...quote, text: 'word '.repeat(60).trim() };
    expect(shareContent(origin, long).text).toBe('Today’s quote on SomeQuote');
  });
});

describe('share links', () => {
  const content = shareContent(origin, quote);

  it('prefills a post on X with the text and the link', () => {
    const url = new URL(postOnXUrl(content));
    expect(url.origin).toBe('https://x.com');
    expect(url.searchParams.get('text')).toBe(content.text);
    expect(url.searchParams.get('url')).toBe(content.url);
  });

  it('prefills an email with the text and the link', () => {
    const url = emailUrl(content);
    expect(url.startsWith('mailto:?subject=')).toBe(true);
    expect(decodeURIComponent(url.split('&body=')[1] ?? '')).toBe(
      `${content.text}\n\n${content.url}`,
    );
  });
});
