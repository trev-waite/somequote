import { nextPublicationAt, publicationDateAt } from '@somequote/domain';
import { Effect } from 'effect';
import type { HistoryDto, PublicationDto } from '../../shared/api-contract';

const MAX_CACHE_MS = 60 * 60 * 1000;

interface PublicationResponseOptions<E> {
  readonly url: string;
  readonly path: '/api/quote/today' | '/api/quotes/history';
  readonly parameters: URLSearchParams;
  readonly at: Date;
  readonly now: () => Date;
  readonly cache: Cache | undefined;
  readonly load: Effect.Effect<PublicationDto | HistoryDto, E>;
}

export function publicationResponse<E>({
  url,
  path,
  parameters,
  at,
  now,
  cache,
  load,
}: PublicationResponseOptions<E>): Effect.Effect<Response, E> {
  return Effect.gen(function* () {
    const key = new URL(path, url);
    key.search = parameters.toString();
    key.searchParams.set('_publication', publicationDateAt(at));
    key.searchParams.set('_version', '1');

    const cached = cache && (yield* bestEffort('match', () => cache.match(key.toString())));
    if (cached) {
      const servedAt = now();
      const expiresAt = new Date(cached.headers.get('Expires') ?? '');
      if (expiresAt.getTime() > servedAt.getTime()) {
        const response = new Response(cached.body, cached);
        response.headers.delete('Age');
        setCacheHeaders(response, servedAt, expiresAt);
        return response;
      }
    }

    const body = yield* load;
    const response = Response.json(body);
    const expiresAt = new Date(
      Math.min(at.getTime() + MAX_CACHE_MS, nextPublicationAt(at).getTime()),
    );
    const servedAt = now();
    setCacheHeaders(response, servedAt, expiresAt);
    if (cache && expiresAt.getTime() - servedAt.getTime() >= 1000) {
      yield* bestEffort('put', () => cache.put(key.toString(), response.clone()));
    }
    return response;
  });
}

function setCacheHeaders(response: Response, at: Date, expiresAt: Date): void {
  const secondsLeft = Math.max(0, Math.floor((expiresAt.getTime() - at.getTime()) / 1000));
  response.headers.set('Cache-Control', `public, max-age=${secondsLeft}`);
  response.headers.set('Date', at.toUTCString());
  response.headers.set('Expires', expiresAt.toUTCString());
}

function bestEffort<A>(
  operation: 'match' | 'put',
  run: () => Promise<A>,
): Effect.Effect<A | undefined> {
  return Effect.tryPromise(run).pipe(
    Effect.tapCause((cause) =>
      Effect.logWarning('Publication cache unavailable', cause).pipe(
        Effect.annotateLogs({ operation }),
      ),
    ),
    Effect.orElseSucceed(() => undefined),
  );
}
