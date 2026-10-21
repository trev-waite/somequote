import { ErrorDto, PublicationDto } from '../shared/api-contract';

export class TodayQuoteUnavailableError extends Error {
  override readonly name = 'TodayQuoteUnavailableError';
}

/**
 * Fetches today's publication and validates it against the shared contract before anything renders
 * it. `fresh` bypasses the browser's HTTP cache, for checking whether the day has turned over.
 */
export async function fetchTodayPublication(
  signal?: AbortSignal,
  { fresh = false }: { readonly fresh?: boolean } = {},
): Promise<PublicationDto> {
  const response = await fetch('/api/quote/today', {
    headers: { Accept: 'application/json' },
    ...(signal ? { signal } : {}),
    ...(fresh ? { cache: 'reload' as const } : {}),
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const failure = ErrorDto.safeParse(body);
    throw new TodayQuoteUnavailableError(
      failure.success
        ? failure.data.error.message
        : `Request failed with status ${response.status}.`,
    );
  }
  const publication = PublicationDto.safeParse(body);
  if (!publication.success) {
    throw new TodayQuoteUnavailableError('The server sent a quote in an unexpected shape.');
  }
  return publication.data;
}
