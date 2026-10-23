import {
  addDays,
  ensurePublication,
  NoEligibleQuoteError,
  type Publication,
  publicationDateAt,
  type QuoteRepository,
  type Random,
} from '@somequote/domain';
import { type Context, Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import {
  type ErrorDto,
  type HistoryDto,
  HistoryQuery,
  type PublicationDto,
} from '../shared/api-contract';
import { publicationResponse } from './publication-cache';

interface AppDependencies {
  readonly repositoryFor: (env: Env) => QuoteRepository;
  readonly now: () => Date;
  readonly random: Random;
  readonly cacheFor?: () => Cache;
}

type AppContext = Context<{ Bindings: Env }>;

export function createApp({ repositoryFor, now, random, cacheFor }: AppDependencies) {
  const app = new Hono<{ Bindings: Env }>().basePath('/api');

  app.use(
    secureHeaders({
      contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      strictTransportSecurity: 'max-age=63072000; includeSubDomains',
      xFrameOptions: 'DENY',
    }),
  );

  app.use(async (c, next) => {
    const client = rateLimitClient(c.req.header('CF-Connecting-IP'));
    const { success } = await c.env.API_RATE_LIMITER.limit({ key: `somequote:api:${client}` });
    if (!success) {
      c.header('Retry-After', '60');
      return errorResponse(
        c,
        429,
        'rate_limited',
        'Too many requests. Please try again in a minute.',
      );
    }
    return next();
  });

  app.get('/quote/today', async (c) => {
    const at = now();
    return publicationResponse({
      url: c.req.url,
      path: '/api/quote/today',
      parameters: new URLSearchParams(),
      at,
      now,
      cache: cacheFor?.(),
      load: async () => {
        const publication = await ensurePublication({
          repository: repositoryFor(c.env),
          date: publicationDateAt(at),
          random,
        });
        return toPublicationDto(publication);
      },
    });
  });

  app.get('/quotes/history', async (c) => {
    const { limit: limits = [], before: dates = [] } = c.req.queries();
    const query = HistoryQuery.safeParse({ limit: limits[0], before: dates[0] });
    if (limits.length > 1 || dates.length > 1 || !query.success) {
      return errorResponse(
        c,
        400,
        'invalid_request',
        'Use limit once as 1–3 decimal digits between 1 and 30, and before once as a YYYY-MM-DD date.',
      );
    }
    const { limit, before } = query.data;
    const at = now();
    const today = publicationDateAt(at);
    const tomorrow = addDays(today, 1);
    const effectiveBefore = before !== undefined && before < tomorrow ? before : tomorrow;
    return publicationResponse({
      url: c.req.url,
      path: '/api/quotes/history',
      parameters: new URLSearchParams({ limit: String(limit), before: effectiveBefore }),
      at,
      now,
      cache: cacheFor?.(),
      load: async () => {
        const repository = repositoryFor(c.env);
        await ensurePublication({ repository, date: today, random });
        const page = await repository.listPublications({
          before: effectiveBefore,
          limit: limit + 1,
        });
        const items = page.slice(0, limit);
        const body: HistoryDto = {
          items: items.map(toPublicationDto),
          nextBefore: page.length > limit ? (items.at(-1)?.date ?? null) : null,
        };
        return body;
      },
    });
  });

  app.notFound((c) => errorResponse(c, 404, 'not_found', 'There is nothing at this address.'));

  app.onError((error, c) => {
    if (error instanceof NoEligibleQuoteError) {
      return errorResponse(c, 503, 'no_quote_available', 'No quote is available right now.');
    }
    console.error(
      JSON.stringify({
        message: 'request failed',
        path: c.req.path,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return errorResponse(c, 500, 'internal_error', 'Something went wrong.');
  });

  return app;
}

/**
 * The rate limit bucket for a client address. One IPv6 host usually controls a whole /64 and can
 * rotate through it freely, so IPv6 addresses share a bucket per /64 prefix.
 */
export function rateLimitClient(ip: string | undefined): string {
  if (!ip) return 'unknown';
  if (!ip.includes(':')) return ip;
  if (ip.includes('.')) return ip.slice(ip.lastIndexOf(':') + 1);
  const [head = '', tail] = ip.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups =
    tail === undefined
      ? left
      : [
          ...left,
          ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'),
          ...right,
        ];
  const prefix = groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, ''));
  return `${prefix.join(':')}::/64`;
}

function toPublicationDto({ date, quote }: Publication): PublicationDto {
  switch (quote.category) {
    case 'general':
      return {
        date,
        quote: {
          category: quote.category,
          id: quote.id,
          text: quote.text,
          author: quote.author,
          source: quote.source,
        },
      };
    case 'bible':
      return {
        date,
        quote: {
          category: quote.category,
          id: quote.id,
          text: quote.text,
          reference: quote.reference,
          translation: quote.translation,
        },
      };
  }
}

function errorResponse(
  c: AppContext,
  status: ContentfulStatusCode,
  code: ErrorDto['error']['code'],
  message: string,
) {
  const body: ErrorDto = { error: { code, message } };
  return c.json(body, status, { 'Cache-Control': 'no-store' });
}
