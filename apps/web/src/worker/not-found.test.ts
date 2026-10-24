import { describe, expect, it, vi } from 'vitest';
import { notFoundResponse } from './not-found';

const origin = 'https://somequote.com';

describe('unknown site requests', () => {
  it.each(['/onfjr', '/one/two/three?next=https://example.com', '/%2e%2e%2f.env'])(
    'redirects a page visit to %s to a fixed local 404 address',
    async (path) => {
      const fetch = vi.fn<Fetcher['fetch']>();
      const response = await notFoundResponse(
        new Request(`${origin}${path}`, {
          headers: { Accept: 'text/html' },
        }),
        { fetch },
      );

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe('/404');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['/assets/missing.js', 'GET'],
    ['/.env', 'GET'],
    ['/.git/config', 'HEAD'],
    ['/src/worker/index.ts', 'GET'],
    ['/onfjr', 'POST'],
  ])(
    'rejects %s (%s) without loading the application or reading an asset',
    async (path, method) => {
      const fetch = vi.fn<Fetcher['fetch']>();
      const response = await notFoundResponse(new Request(`${origin}${path}`, { method }), {
        fetch,
      });

      expect(response.status).toBe(404);
      expect(response.headers.get('Location')).toBeNull();
      expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(await response.text()).toBe(method === 'HEAD' ? '' : 'Not found.');
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('serves the custom page with a real 404, its original script policy, and no home-page canonical', async () => {
    const html =
      '<html><head><title>SomeQuote</title><link rel="canonical" href="https://somequote.com/" /><meta property="og:title" content="SomeQuote" /><meta property="og:url" content="https://somequote.com/" /></head><body><script integrity="sha384-original">original()</script></body></html>';
    const fetch = vi.fn<Fetcher['fetch']>().mockResolvedValue(
      new Response(html, {
        headers: {
          'Content-Type': 'text/html',
          'Content-Security-Policy': "script-src 'self' 'sha384-original'",
          'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
          ETag: 'home-page',
        },
      }),
    );
    const response = await notFoundResponse(
      new Request(`${origin}/404?ignored=true`, {
        headers: { 'If-None-Match': 'home-page' },
      }),
      { fetch },
    );
    const body = await response.text();

    expect(fetch).toHaveBeenCalledWith(new URL(`${origin}/`), { method: 'GET' });
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(response.headers.get('Content-Security-Policy')).toBe(
      "script-src 'self' 'sha384-original'",
    );
    expect(response.headers.get('Strict-Transport-Security')).toBe(
      'max-age=63072000; includeSubDomains',
    );
    expect(response.headers.has('ETag')).toBe(false);
    expect(body).toContain('<title>Page not found · SomeQuote</title>');
    expect(body).not.toContain('rel="canonical"');
    expect(body).toContain('content="https://somequote.com/404"');
    expect(body).toContain('<script integrity="sha384-original">original()</script>');
  });
});
