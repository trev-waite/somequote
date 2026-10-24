const HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Content-Type': 'text/plain; charset=utf-8',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex',
};

/** True when one of the Accept header's media ranges is exactly `text/html` with a quality above 0. */
function acceptsHtml(accept: string | null): boolean {
  return (accept ?? '').split(',').some((range) => {
    const [type, ...parameters] = range.split(';').map((part) => part.trim().toLowerCase());
    const quality = parameters.find((parameter) => parameter.startsWith('q='));
    return type === 'text/html' && (quality === undefined || Number(quality.slice(2)) > 0);
  });
}

export async function notFoundResponse(
  request: Request,
  assets: Pick<Fetcher, 'fetch'>,
): Promise<Response> {
  const url = new URL(request.url);
  const canNavigate = request.method === 'GET' || request.method === 'HEAD';

  if (canNavigate && url.pathname === '/404') {
    const page = await assets.fetch(new URL('/', url), { method: request.method });
    const headers = new Headers(page.headers);
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Robots-Tag', 'noindex');
    headers.delete('ETag');
    headers.delete('Content-Length');
    const response = new Response(page.body, { status: 404, headers });
    return new HTMLRewriter()
      .on('title', {
        element(element) {
          element.setInnerContent('Page not found · SomeQuote');
        },
      })
      .on('link[rel="canonical"]', {
        element(element) {
          element.remove();
        },
      })
      .on('meta[name="description"], meta[property="og:description"]', {
        element(element) {
          element.setAttribute('content', 'A little lost? Find your way back to today’s quote.');
        },
      })
      .on('meta[property="og:title"]', {
        element(element) {
          element.setAttribute('content', 'Page not found · SomeQuote');
        },
      })
      .on('meta[property="og:url"]', {
        element(element) {
          element.setAttribute('content', 'https://somequote.com/404');
        },
      })
      .transform(response);
  }

  if (canNavigate && acceptsHtml(request.headers.get('Accept'))) {
    return new Response(null, { status: 302, headers: { ...HEADERS, Location: '/404' } });
  }

  return new Response(request.method === 'HEAD' ? null : 'Not found.', {
    status: 404,
    headers: HEADERS,
  });
}
