import {
  CATEGORIES,
  isPublicationDate,
  isQuoteId,
  type Publication,
  type QuoteRepository,
  type QuoteUsage,
  type SelectionSnapshot,
} from '@somequote/domain';
import { z } from 'zod/mini';
import { branded } from '../shared/branded';

const QuoteIdColumn = branded(isQuoteId, 'quote id');
const DateColumn = branded(isPublicationDate, 'publication date');
const CategoryColumn = z.enum(CATEGORIES);
const CountColumn = z.int().check(z.minimum(0));

const PublicationRow = z.pipe(
  z.discriminatedUnion('category', [
    z.object({
      publish_date: DateColumn,
      id: QuoteIdColumn,
      category: z.literal('general'),
      text: z.string(),
      author: z.string(),
      source: z.string(),
    }),
    z.object({
      publish_date: DateColumn,
      id: QuoteIdColumn,
      category: z.literal('bible'),
      text: z.string(),
      reference: z.string(),
      translation: z.string(),
    }),
  ]),
  z.transform((row): Publication => {
    switch (row.category) {
      case 'general':
        return {
          date: row.publish_date,
          quote: {
            category: row.category,
            id: row.id,
            text: row.text,
            author: row.author,
            source: row.source,
          },
        };
      case 'bible':
        return {
          date: row.publish_date,
          quote: {
            category: row.category,
            id: row.id,
            text: row.text,
            reference: row.reference,
            translation: row.translation,
          },
        };
    }
  }),
);

const UsageRow = z.pipe(
  z.object({
    id: QuoteIdColumn,
    category: CategoryColumn,
    times_published: CountColumn,
    last_published_on: z.nullable(DateColumn),
  }),
  z.transform(
    (row): QuoteUsage => ({
      id: row.id,
      category: row.category,
      timesPublished: row.times_published,
      lastPublishedOn: row.last_published_on,
    }),
  ),
);

const CountRow = z.object({ published_count: CountColumn });
const CategoryRow = z.object({ category: CategoryColumn });

const SELECT_PUBLICATION = `
  SELECT p.publish_date, q.id, q.category, q.text, q.author, q.source, q.reference, q.translation
  FROM publications AS p
  JOIN quotes AS q ON q.id = p.quote_id`;

/**
 * `QuoteRepository` on Cloudflare D1. A `batch` runs as one SQL transaction, which is what makes
 * the snapshot consistent and the insert-then-read in `publishIfAbsent` atomic.
 */
export class D1QuoteRepository implements QuoteRepository {
  readonly #db: D1Database;

  constructor(db: D1Database) {
    this.#db = db;
  }

  async findPublication(date: Publication['date']): Promise<Publication | null> {
    const row = await this.#db
      .prepare(`${SELECT_PUBLICATION} WHERE p.publish_date = ?1`)
      .bind(date)
      .first();
    return row === null ? null : PublicationRow.parse(row);
  }

  async loadSelectionSnapshot({
    recentLimit,
  }: {
    readonly recentLimit: number;
  }): Promise<SelectionSnapshot> {
    const [usage, count, recent] = await this.#db.batch([
      this.#db.prepare(`
        SELECT q.id, q.category,
          COUNT(p.publish_date) AS times_published,
          MAX(p.publish_date) AS last_published_on
        FROM quotes AS q
        LEFT JOIN publications AS p ON p.quote_id = q.id
        WHERE q.enabled = 1
        GROUP BY q.id`),
      this.#db.prepare('SELECT COUNT(*) AS published_count FROM publications'),
      this.#db
        .prepare(`
          SELECT q.category
          FROM publications AS p
          JOIN quotes AS q ON q.id = p.quote_id
          ORDER BY p.publish_date DESC
          LIMIT ?1`)
        .bind(recentLimit),
    ]);
    return {
      candidates: z.array(UsageRow).parse(usage?.results),
      publishedCount: CountRow.parse(count?.results[0]).published_count,
      recentCategories: z
        .array(CategoryRow)
        .parse(recent?.results)
        .map((row) => row.category),
    };
  }

  async publishIfAbsent({
    date,
    quoteId,
  }: Parameters<QuoteRepository['publishIfAbsent']>[0]): Promise<Publication | null> {
    const [, current] = await this.#db.batch([
      this.#db
        .prepare(`
          INSERT INTO publications (publish_date, quote_id)
          SELECT ?1, id FROM quotes WHERE id = ?2 AND enabled = 1
          ON CONFLICT (publish_date) DO NOTHING`)
        .bind(date, quoteId),
      this.#db.prepare(`${SELECT_PUBLICATION} WHERE p.publish_date = ?1`).bind(date),
    ]);
    const row = current?.results[0];
    return row === undefined ? null : PublicationRow.parse(row);
  }

  async listPublications({
    before,
    limit,
  }: Parameters<QuoteRepository['listPublications']>[0]): Promise<Publication[]> {
    const { results } = await this.#db
      .prepare(`
        ${SELECT_PUBLICATION}
        WHERE ?1 IS NULL OR p.publish_date < ?1
        ORDER BY p.publish_date DESC
        LIMIT ?2`)
      .bind(before, limit)
      .all();
    return z.array(PublicationRow).parse(results);
  }
}
