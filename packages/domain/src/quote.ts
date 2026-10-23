export const CATEGORIES = ['general', 'bible'] as const;

export type Category = (typeof CATEGORIES)[number];

export type QuoteId = string & { readonly __brand: 'QuoteId' };

const QUOTE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const QUOTE_ID_MAX_LENGTH = 96;

export function isQuoteId(value: string): value is QuoteId {
  return value.length <= QUOTE_ID_MAX_LENGTH && QUOTE_ID_PATTERN.test(value);
}

export function parseQuoteId(value: string): QuoteId {
  if (!isQuoteId(value)) throw new Error(`Invalid quote id: ${JSON.stringify(value)}`);
  return value;
}

export const QUOTE_TEXT_MAX_LENGTH = 360;
const ATTRIBUTION_MAX_LENGTH = 80;

/** Control, format (bidi overrides, zero-width), private-use, and line or paragraph separators. */
const HIDDEN_CHARACTER = /[\p{C}\p{Zl}\p{Zp}]/u;

export function isQuoteText(value: string): boolean {
  return (
    value.length <= QUOTE_TEXT_MAX_LENGTH && !HIDDEN_CHARACTER.test(value.replaceAll('\n', ''))
  );
}

export function isAttributionText(value: string): boolean {
  return value.length <= ATTRIBUTION_MAX_LENGTH && !HIDDEN_CHARACTER.test(value);
}

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

export interface GeneralQuote {
  readonly category: 'general';
  readonly id: QuoteId;
  readonly text: string;
  readonly author: string;
  readonly source: string;
}

export interface BibleVerse {
  readonly category: 'bible';
  readonly id: QuoteId;
  readonly text: string;
  readonly reference: string;
  readonly translation: string;
}

export type Quote = GeneralQuote | BibleVerse;
