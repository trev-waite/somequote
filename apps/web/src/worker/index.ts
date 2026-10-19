import { ensurePublication, publicationDateAt } from '@somequote/domain';
import { createApp } from './app';
import { D1QuoteRepository } from './d1-quote-repository';

const repositoryFor = (env: Env) => new D1QuoteRepository(env.DB);

const app = createApp({ repositoryFor, now: () => new Date(), random: Math.random });

export default {
  fetch: app.fetch,

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
