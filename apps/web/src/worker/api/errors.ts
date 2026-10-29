import type { PublicationError } from '@somequote/domain/publication';
import { Cause, Effect, Result } from 'effect';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ErrorDto } from '../../shared/api-contract';
import { runLogged } from '../logging';

export function errorResponse(
  c: Context,
  status: ContentfulStatusCode,
  code: ErrorDto['error']['code'],
  message: string,
) {
  const body: ErrorDto = { error: { code, message } };
  return c.json(body, status, { 'Cache-Control': 'no-store' });
}

/** Runs a route, logging any failure with its full cause and answering with its public error. */
export function respond(
  c: Context,
  route: Effect.Effect<Response, PublicationError>,
): Promise<Response> {
  return runLogged(
    route.pipe(
      Effect.catchCause((cause) =>
        Effect.logError('Request failed', cause).pipe(Effect.as(failureResponse(c, cause))),
      ),
      Effect.annotateLogs({ route: c.req.routePath }),
    ),
  );
}

function failureResponse(c: Context, cause: Cause.Cause<PublicationError>): Response {
  const failure = Cause.findError(cause);
  if (Result.isFailure(failure)) return internalError(c);
  switch (failure.success._tag) {
    case 'NoEligibleQuoteError':
      return errorResponse(c, 503, 'no_quote_available', 'No quote is available right now.');
    case 'PublicationContendedError':
    case 'QuoteStoreError':
      return internalError(c);
  }
}

function internalError(c: Context): Response {
  return errorResponse(c, 500, 'internal_error', 'Something went wrong.');
}
