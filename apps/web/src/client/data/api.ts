import { ErrorDto, PublicationDto } from '../../shared/api-contract';
import { publicationDateAt } from '../../shared/schedule';

declare global {
  interface Window {
    /** The page-load request from public/request-today.js, until the first fetch takes it. */
    todayResponse: Promise<Response | undefined> | undefined;
  }
}

export class TodayQuoteUnavailableError extends Error {
  override readonly name = 'TodayQuoteUnavailableError';
}

export async function fetchTodayPublication(
  signal?: AbortSignal,
  { fresh = false }: { readonly fresh?: boolean } = {},
): Promise<PublicationDto> {
  const started = window.todayResponse;
  window.todayResponse = undefined;
  const early = await started;
  const response =
    early ??
    (await fetch('/api/quote/today', {
      headers: { Accept: 'application/json' },
      ...(signal ? { signal } : {}),
      ...(fresh ? { cache: 'reload' as const } : {}),
    }));
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
  // The countdown starts after the page-load request, so it would miss a midnight between them.
  if (early && publication.data.date < publicationDateAt(new Date())) {
    return fetchTodayPublication(signal, { fresh: true });
  }
  return publication.data;
}
