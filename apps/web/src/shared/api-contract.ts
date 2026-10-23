import { isAttributionText, isPublicationDate, isQuoteText } from '@somequote/domain';
import { z } from 'zod/mini';
import { branded } from './branded';

const CalendarDate = branded(isPublicationDate, 'calendar date (expected YYYY-MM-DD)');
const QuoteText = z
  .string()
  .check(z.refine(isQuoteText, 'Quote text is too long or has hidden characters'));
const Attribution = z
  .string()
  .check(z.refine(isAttributionText, 'Attribution is too long or has hidden characters'));

export const QuoteDto = z.discriminatedUnion('category', [
  z.object({
    category: z.literal('general'),
    id: z.string(),
    text: QuoteText,
    author: Attribution,
    source: Attribution,
  }),
  z.object({
    category: z.literal('bible'),
    id: z.string(),
    text: QuoteText,
    reference: Attribution,
    translation: Attribution,
  }),
]);
export type QuoteDto = z.infer<typeof QuoteDto>;

export const PublicationDto = z.object({ date: CalendarDate, quote: QuoteDto });
export type PublicationDto = z.infer<typeof PublicationDto>;

export const HistoryDto = z.object({
  items: z.array(PublicationDto),
  nextBefore: z.nullable(CalendarDate),
});
export type HistoryDto = z.infer<typeof HistoryDto>;

const HISTORY_PAGE_SIZE = { default: 10, max: 30 } as const;

export const HistoryQuery = z.object({
  limit: z._default(
    z.pipe(
      z.string().check(z.maxLength(3), z.regex(/^[0-9]+$/)),
      z.coerce.number<string>().check(z.minimum(1), z.maximum(HISTORY_PAGE_SIZE.max)),
    ),
    HISTORY_PAGE_SIZE.default,
  ),
  before: z.optional(CalendarDate),
});

const ERROR_CODES = [
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
