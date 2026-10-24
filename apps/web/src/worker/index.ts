import { ensurePublication, publicationDateAt } from '@somequote/domain';
import { createApp } from './api/app';
import { D1QuoteRepository } from './db/d1-quote-repository';
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

  async scheduled(controller, env) {
    const date = publicationDateAt(new Date(controller.scheduledTime));
    const publication = await ensurePublication({
      repository: repositoryFor(env),
      date,
      random: Math.random,
    });
    console.log(
      JSON.stringify({
        message: 'publication ensured',
        cron: controller.cron,
        date,
        quoteId: publication.quote.id,
      }),
    );
  },
} satisfies ExportedHandler<Env>;
