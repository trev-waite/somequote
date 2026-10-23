import { parseQuoteId, type Quote } from '@somequote/domain';
import { BIBLE_TRANSLATION, BIBLE_VERSES } from './quotes/bible';
import { GENERAL_QUOTES } from './quotes/general';
import { SPORTS_QUOTES } from './quotes/sports';

export interface CollectionEntry {
  readonly quote: Quote;
  readonly enabled: boolean;
}

export const COLLECTION: readonly CollectionEntry[] = [
  ...[...GENERAL_QUOTES, ...SPORTS_QUOTES].map(
    (entry): CollectionEntry => ({
      quote: {
        category: 'general',
        id: parseQuoteId(entry.id),
        text: entry.text,
        author: entry.author,
        source: entry.source,
      },
      enabled: entry.enabled ?? true,
    }),
  ),
  ...BIBLE_VERSES.map(
    (entry): CollectionEntry => ({
      quote: {
        category: 'bible',
        id: parseQuoteId(entry.id),
        text: entry.text,
        reference: entry.reference,
        translation: BIBLE_TRANSLATION,
      },
      enabled: entry.enabled ?? true,
    }),
  ),
];
