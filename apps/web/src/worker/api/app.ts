import { publicationDateAt, type Random } from '@somequote/domain';
import {
  ensurePublication,
  historyCursor,
  listHistory,
  type QuoteRepository,
} from '@somequote/domain/publication';
import { Effect } from 'effect';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { HistoryQuery } from '../../shared/api-contract';
import { toHistoryDto, toPublicationDto } from './dto';
import { errorResponse, respond } from './errors';
import { publicationResponse } from './publication-cache';
import { rateLimit } from './rate-limit';

interface AppDependencies {
  readonly repositoryFor: (env: Env) => QuoteRepository;
  readonly now: () => Date;
  readonly random: Random;
  readonly cacheFor?: () => Cache;
}

export function createApp({ repositoryFor, now, random, cacheFor }: AppDependencies) {
  const app = new Hono<{ Bindings: Env }>().basePath('/api');

  app.use(
    secureHeaders({
      contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      strictTransportSecurity: 'max-age=63072000; includeSubDomains',
      xFrameOptions: 'DENY',
    }),
  );
  app.use(rateLimit);

  app.get('/quote/today', async (c) => {
    const at = now();
    return respond(
      c,
      publicationResponse({
        url: c.req.url,
        path: '/api/quote/today',
        parameters: new URLSearchParams(),
        at,
        now,
        cache: cacheFor?.(),
        load: Effect.suspend(() =>
          ensurePublication({
            repository: repositoryFor(c.env),
            date: publicationDateAt(at),
            random,
          }),
        ).pipe(Effect.map(toPublicationDto)),
      }),
    );
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
    const { limit } = query.data;
    const at = now();
    const today = publicationDateAt(at);
    const before = historyCursor(today, query.data.before);
    return respond(
      c,
      publicationResponse({
        url: c.req.url,
        path: '/api/quotes/history',
        parameters: new URLSearchParams({ limit: String(limit), before }),
        at,
        now,
        cache: cacheFor?.(),
        load: Effect.suspend(() =>
          listHistory({ repository: repositoryFor(c.env), today, before, limit, random }),
        ).pipe(Effect.map(toHistoryDto)),
      }),
    );
  });

  app.notFound((c) => errorResponse(c, 404, 'not_found', 'There is nothing at this address.'));

  app.onError((error, c) => respond(c, Effect.die(error)));

  return app;
}
