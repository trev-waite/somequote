import type { CollectionEntry } from '@somequote/content';

/** Removed quotes are disabled, not deleted, because publication history references them. */
export function seedStatements(collection: readonly CollectionEntry[]): string[] {
  const upserts = collection.map(({ quote, enabled }) => {
    const attribution =
      quote.category === 'general'
        ? [quote.author, quote.source, null, null]
        : [null, null, quote.reference, quote.translation];
    const values = [quote.id, quote.category, quote.text, ...attribution].map(sqlLiteral);
    return `INSERT INTO quotes (id, category, text, author, source, reference, translation, enabled)
VALUES (${values.join(', ')}, ${enabled ? 1 : 0})
ON CONFLICT (id) DO UPDATE SET
  text = excluded.text, author = excluded.author, source = excluded.source,
  reference = excluded.reference, translation = excluded.translation, enabled = excluded.enabled;`;
  });
  const ids = collection.map(({ quote }) => sqlLiteral(quote.id)).join(', ');
  return [...upserts, `UPDATE quotes SET enabled = 0 WHERE id NOT IN (${ids});`];
}

/** Seed files are executed by Wrangler, which takes plain SQL, so values are written as literals. */
function sqlLiteral(value: string | null): string {
  return value === null ? 'NULL' : `'${value.replaceAll("'", "''")}'`;
}
