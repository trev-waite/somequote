import { isPublicationDate } from '@somequote/domain';
import { z } from 'zod/mini';
import { branded } from './branded';

/** The HTTP contract shared by the Worker (which produces it) and the client (which parses it). */

const CalendarDate = branded(isPublicationDate, 'calendar date (expected YYYY-MM-DD)');

export const QuoteDto = z.discriminatedUnion('category', [
  z.object({
    category: z.literal('general'),
    id: z.string(),
    text: z.string(),
    author: z.string(),
    source: z.string(),
  }),
  z.object({
    category: z.literal('bible'),
    id: z.string(),
    text: z.string(),
    reference: z.string(),
    translation: z.string(),
  }),
]);
export type QuoteDto = z.infer<typeof QuoteDto>;

/** `GET /api/quote/today` */
export const PublicationDto = z.object({ date: CalendarDate, quote: QuoteDto });
export type PublicationDto = z.infer<typeof PublicationDto>;

/** `GET /api/quotes/history?limit=&before=`: newest first; pass `nextBefore` as `before` for the next page. */
export const HistoryDto = z.object({
  items: z.array(PublicationDto),
  nextBefore: z.nullable(CalendarDate),
});
export type HistoryDto = z.infer<typeof HistoryDto>;

export const HISTORY_PAGE_SIZE = { default: 10, max: 30 } as const;

export const HistoryQuery = z.object({
  limit: z._default(
    z.pipe(z.coerce.number(), z.int().check(z.minimum(1), z.maximum(HISTORY_PAGE_SIZE.max))),
    HISTORY_PAGE_SIZE.default,
  ),
  before: z.optional(CalendarDate),
});

export const ERROR_CODES = [
  'invalid_request',
  'not_found',
  'rate_limited',
  'no_quote_available',
  'internal_error',
] as const;

export const ErrorDto = z.object({
  error: z.object({ code: z.enum(ERROR_CODES), message: z.string() }),
});
export type ErrorDto = z.infer<typeof ErrorDto>;
