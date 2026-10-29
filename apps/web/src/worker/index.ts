import { publicationDateAt } from '@somequote/domain';
import { ensurePublication } from '@somequote/domain/publication';
import { Effect } from 'effect';
import { createApp } from './api/app';
import { D1QuoteRepository } from './db/d1-quote-repository';
import { runLogged } from './logging';
import { notFoundResponse } from './not-found';

const repositoryFor = (env: Env) => new D1QuoteRepository(env.DB);

const app = createApp({
  repositoryFor,
  now: () => new Date(),
  random: Math.random,
  cacheFor: () => caches.default,
});

export default {
  fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return app.fetch(request, env, ctx);
    }
    return notFoundResponse(request, env.ASSETS);
  },

  scheduled(controller, env) {
    const date = publicationDateAt(new Date(controller.scheduledTime));
    return runLogged(
      ensurePublication({ repository: repositoryFor(env), date, random: Math.random }).pipe(
        Effect.tap((publication) =>
          Effect.logInfo('Publication ensured').pipe(
            Effect.annotateLogs({ quoteId: publication.quote.id }),
          ),
        ),
        Effect.tapCause((cause) => Effect.logError('Scheduled publication failed', cause)),
        Effect.annotateLogs({ cron: controller.cron, date }),
        Effect.asVoid,
      ),
    );
  },
} satisfies ExportedHandler<Env>;
