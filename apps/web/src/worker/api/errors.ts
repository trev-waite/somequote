import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ErrorDto } from '../../shared/api-contract';

export function errorResponse(
  c: Context,
  status: ContentfulStatusCode,
  code: ErrorDto['error']['code'],
  message: string,
) {
  const body: ErrorDto = { error: { code, message } };
  return c.json(body, status, { 'Cache-Control': 'no-store' });
}
