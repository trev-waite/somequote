import { nextPublicationAt, publicationDateAt } from '@somequote/domain';
import type { HistoryDto, PublicationDto } from '../shared/api-contract';

const MAX_CACHE_MS = 60 * 60 * 1000;

interface PublicationResponseOptions {
  readonly url: string;
  readonly parameters: URLSearchParams;
  readonly at: Date;
  readonly now: () => Date;
  readonly cache: Cache | undefined;
  readonly load: () => Promise<PublicationDto | HistoryDto>;
}

/** Shared responses expire within an hour and cannot cross an Eastern publication date. */
export async function publicationResponse({
  url,
  parameters,
  at,
  now,
  cache,
  load,
}: PublicationResponseOptions): Promise<Response> {
  const key = new URL(url);
  key.search = parameters.toString();
  key.searchParams.set('_publication', publicationDateAt(at));
  key.searchParams.set('_version', '1');

  const cached = await cache?.match(key.toString()).catch(logCacheFailure);
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

  const body = await load();
  const response = Response.json(body);
  const expiresAt = new Date(
    Math.min(at.getTime() + MAX_CACHE_MS, nextPublicationAt(at).getTime()),
  );
  const servedAt = now();
  setCacheHeaders(response, servedAt, expiresAt);
  if (expiresAt.getTime() - servedAt.getTime() >= 1000) {
    await cache?.put(key.toString(), response.clone()).catch(logCacheFailure);
  }
  return response;
}

function setCacheHeaders(response: Response, at: Date, expiresAt: Date): void {
  const secondsLeft = Math.max(0, Math.floor((expiresAt.getTime() - at.getTime()) / 1000));
  response.headers.set('Cache-Control', `public, max-age=${secondsLeft}`);
  response.headers.set('Date', at.toUTCString());
  response.headers.set('Expires', expiresAt.toUTCString());
}

function logCacheFailure(error: unknown): void {
  console.error('Publication cache unavailable', error);
}
