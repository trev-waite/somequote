import type { QuoteDto } from '../shared/api-contract';
import { attributionOf } from './Publication';

export interface ShareContent {
  readonly url: string;
  readonly text: string;
}

const FALLBACK_TEXT = 'Today’s quote on SomeQuote';
/** A post holds 280 characters, and X counts any link as 23 of them plus a space. */
const POST_TEXT_LIMIT = 280 - 24;

/** Shares the site with today's quote in the message when it fits in a post. */
export function shareContent(origin: string, quote: QuoteDto | undefined): ShareContent {
  const url = `${origin}/`;
  if (!quote) return { url, text: FALLBACK_TEXT };
  const text = `“${quote.text}” — ${attributionOf(quote).primary}`;
  return { url, text: text.length <= POST_TEXT_LIMIT ? text : FALLBACK_TEXT };
}

export function postOnXUrl({ url, text }: ShareContent): string {
  const query = new URLSearchParams({ text, url });
  return `https://x.com/intent/tweet?${query}`;
}

export function emailUrl({ url, text }: ShareContent): string {
  const subject = encodeURIComponent('A quote from SomeQuote');
  const body = encodeURIComponent(`${text}\n\n${url}`);
  return `mailto:?subject=${subject}&body=${body}`;
}

/** The system share sheet (messages, mail, other apps), where the browser has one. */
export function canShareNatively(): boolean {
  return typeof navigator.share === 'function';
}
