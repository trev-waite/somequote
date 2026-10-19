import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { type BibleVerse, type GeneralQuote, parseQuoteId, type Quote } from '@somequote/domain';

/** Storage is shared by every test in a file, so each test starts from freshly migrated tables. */
export async function resetDatabase(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DROP TABLE IF EXISTS publications'),
    env.DB.prepare('DROP TABLE IF EXISTS quotes'),
    env.DB.prepare('DROP TABLE IF EXISTS d1_migrations'),
  ]);
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
}

export function generalQuote(id: string): GeneralQuote {
  return {
    category: 'general',
    id: parseQuoteId(id),
    text: `A thought worth keeping, number ${id}.`,
    author: 'An Author',
    source: 'A Book',
  };
}

export function bibleVerse(id: string): BibleVerse {
  return {
    category: 'bible',
    id: parseQuoteId(id),
    text: `A verse worth keeping, number ${id}.`,
    reference: 'Psalm 1:1',
    translation: 'World English Bible',
  };
}

export function quotes(prefix: string, count: number, make: (id: string) => Quote): Quote[] {
  return Array.from({ length: count }, (_, index) => make(`${prefix}-${index + 1}`));
}

export async function insertQuotes(items: readonly Quote[]): Promise<void> {
  const insert = env.DB.prepare(`
    INSERT INTO quotes (id, category, text, author, source, reference, translation)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`);
  await env.DB.batch(
    items.map((quote) =>
      quote.category === 'general'
        ? insert.bind(quote.id, quote.category, quote.text, quote.author, quote.source, null, null)
        : insert.bind(
            quote.id,
            quote.category,
            quote.text,
            null,
            null,
            quote.reference,
            quote.translation,
          ),
    ),
  );
}

export async function setEnabled(ids: readonly string[], enabled: boolean): Promise<void> {
  await env.DB.batch(
    ids.map((id) =>
      env.DB.prepare('UPDATE quotes SET enabled = ?1 WHERE id = ?2').bind(enabled ? 1 : 0, id),
    ),
  );
}

export async function publicationRows(): Promise<{ publish_date: string; quote_id: string }[]> {
  const { results } = await env.DB.prepare(
    'SELECT publish_date, quote_id FROM publications ORDER BY publish_date',
  ).all<{ publish_date: string; quote_id: string }>();
  return results;
}
