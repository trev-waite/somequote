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

  describe('with a request started during page load', () => {
    const today = {
      date: '2026-10-18',
      quote: { category: 'general', id: 'a', text: 'Hi.', author: 'A', source: 'B' },
    };

    afterEach(() => {
      vi.useRealTimers();
    });

    it('takes it once, then fetches', async () => {
      vi.useFakeTimers({ now: new Date('2026-10-18T16:00:00Z'), toFake: ['Date'] });
      respondWith(today);
      window.todayResponse = Promise.resolve(Response.json(today));

      await expect(fetchTodayPublication()).resolves.toEqual(today);
      expect(fetch).not.toHaveBeenCalled();
      await expect(fetchTodayPublication()).resolves.toEqual(today);
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('fetches when it failed', async () => {
      vi.useFakeTimers({ now: new Date('2026-10-18T16:00:00Z'), toFake: ['Date'] });
      respondWith(today);
      window.todayResponse = Promise.resolve(undefined);

      await expect(fetchTodayPublication()).resolves.toEqual(today);
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('fetches a fresh quote when midnight passed after it was answered', async () => {
      vi.useFakeTimers({ now: new Date('2026-10-18T04:00:01Z'), toFake: ['Date'] });
      respondWith(today);
      window.todayResponse = Promise.resolve(Response.json({ ...today, date: '2026-10-17' }));

      await expect(fetchTodayPublication()).resolves.toEqual(today);
      expect(fetch).toHaveBeenCalledExactlyOnceWith(
        '/api/quote/today',
        expect.objectContaining({ cache: 'reload' }),
      );
    });
  });
});
