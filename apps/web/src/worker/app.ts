import {
  addDays,
  ensurePublication,
  NoEligibleQuoteError,
  nextPublicationAt,
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

export interface AppDependencies {
  readonly repositoryFor: (env: Env) => QuoteRepository;
  readonly now: () => Date;
  readonly random: Random;
}

type AppContext = Context<{ Bindings: Env }>;

/** Responses may be cached until the next publication, but never longer than this. */
const MAX_CACHE_SECONDS = 60 * 60;

export function createApp({ repositoryFor, now, random }: AppDependencies) {
  const app = new Hono<{ Bindings: Env }>().basePath('/api');

  app.use(
    secureHeaders({
      contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      strictTransportSecurity: 'max-age=31536000',
      xFrameOptions: 'DENY',
    }),
  );

  app.get('/quote/today', async (c) => {
    const at = now();
    const publication = await ensurePublication({
      repository: repositoryFor(c.env),
      date: publicationDateAt(at),
      random,
    });
    const body: PublicationDto = toPublicationDto(publication);
    return c.json(body, 200, cacheUntilNextPublication(at));
  });

  app.get('/quotes/history', async (c) => {
    const query = HistoryQuery.safeParse(c.req.query());
    if (!query.success) {
      return errorResponse(
        c,
        400,
        'invalid_request',
        'Use limit between 1 and 30 and before as a YYYY-MM-DD date.',
      );
    }
    const { limit, before } = query.data;
    const at = now();
    const today = publicationDateAt(at);
    const repository = repositoryFor(c.env);
    await ensurePublication({ repository, date: today, random });

    const tomorrow = addDays(today, 1);
    const page = await repository.listPublications({
      before: before !== undefined && before < tomorrow ? before : tomorrow,
      limit: limit + 1,
    });
    const items = page.slice(0, limit);
    const body: HistoryDto = {
      items: items.map(toPublicationDto),
      nextBefore: page.length > limit ? (items.at(-1)?.date ?? null) : null,
    };
    return c.json(body, 200, cacheUntilNextPublication(at));
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

function cacheUntilNextPublication(at: Date): Record<string, string> {
  const secondsLeft = Math.floor((nextPublicationAt(at).getTime() - at.getTime()) / 1000);
  return { 'Cache-Control': `public, max-age=${Math.min(secondsLeft, MAX_CACHE_SECONDS)}` };
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
