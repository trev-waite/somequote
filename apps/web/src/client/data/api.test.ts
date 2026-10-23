import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTodayPublication, TodayQuoteUnavailableError } from './api';

function respondWith(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      typeof body === 'string' ? new Response(body, { status }) : Response.json(body, { status }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchTodayPublication', () => {
  it('returns a publication that matches the contract', async () => {
    const publication = {
      date: '2026-10-18',
      quote: {
        category: 'bible',
        id: 'web-psalm-23-1',
        text: 'Yahweh is my shepherd; I shall lack nothing.',
        reference: 'Psalm 23:1',
        translation: 'World English Bible',
      },
    };
    respondWith(publication);

    await expect(fetchTodayPublication()).resolves.toEqual(publication);
    expect(fetch).toHaveBeenCalledWith('/api/quote/today', expect.anything());
  });

  it.each([
    [
      'a missing attribution',
      { date: '2026-10-18', quote: { category: 'general', id: 'a', text: 'Hi.' } },
    ],
    [
      'an unknown category',
      { date: '2026-10-18', quote: { category: 'poetry', id: 'a', text: 'Hi.' } },
    ],
    [
      'an impossible date',
      {
        date: '2026-02-30',
        quote: { category: 'general', id: 'a', text: 'Hi.', author: 'A', source: 'B' },
      },
    ],
    [
      'oversized text',
      {
        date: '2026-10-18',
        quote: {
          category: 'general',
          id: 'a',
          text: 'word '.repeat(20_000),
          author: 'A',
          source: 'B',
        },
      },
    ],
    [
      'an oversized attribution',
      {
        date: '2026-10-18',
        quote: { category: 'general', id: 'a', text: 'Hi.', author: 'A'.repeat(81), source: 'B' },
      },
    ],
    [
      'a bidi override in the attribution',
      {
        date: '2026-10-18',
        quote: {
          category: 'general',
          id: 'a',
          text: 'Hi.',
          author: 'Ralph\u202EWaldo',
          source: 'B',
        },
      },
    ],
    [
      'a zero-width character in the text',
      {
        date: '2026-10-18',
        quote: { category: 'bible', id: 'a', text: 'Hi\u200B.', reference: 'R', translation: 'T' },
      },
    ],
    ['a body that is not JSON', '<html>proxy error</html>'],
  ])('rejects %s instead of rendering it', async (_, body) => {
    respondWith(body);

    await expect(fetchTodayPublication()).rejects.toBeInstanceOf(TodayQuoteUnavailableError);
  });

  it('accepts line breaks in the quote text', async () => {
    const publication = {
      date: '2026-10-18',
      quote: {
        category: 'general',
        id: 'a',
        text: 'One line.\nAnother.',
        author: 'A',
        source: 'B',
      },
    };
    respondWith(publication);

    await expect(fetchTodayPublication()).resolves.toEqual(publication);
  });

  it('surfaces the server’s typed error message', async () => {
    respondWith(
      { error: { code: 'no_quote_available', message: 'No quote is available right now.' } },
      503,
    );

    await expect(fetchTodayPublication()).rejects.toThrow('No quote is available right now.');
  });

  it('describes an unreadable failure by its status', async () => {
    respondWith('gateway timeout', 504);

    await expect(fetchTodayPublication()).rejects.toThrow('status 504');
  });
});
