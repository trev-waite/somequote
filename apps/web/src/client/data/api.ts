import { ErrorDto, PublicationDto } from '../../shared/api-contract';

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
  const response =
    (await started) ??
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
  return publication.data;
}
