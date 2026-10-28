import { env } from 'cloudflare:workers';
import { COLLECTION, type CollectionEntry } from '@somequote/content';
import { parsePublicationDate } from '@somequote/domain';
import { ensurePublication } from '@somequote/domain/publication';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '../test-support';
import { D1QuoteRepository } from './d1-quote-repository';
import { seedStatements } from './seed-sql';

async function seed(collection: readonly CollectionEntry[]) {
  await env.DB.batch(seedStatements(collection).map((statement) => env.DB.prepare(statement)));
}

async function rows() {
  const { results } = await env.DB.prepare(
    'SELECT id, category, text, author, source, reference, translation, enabled FROM quotes ORDER BY id',
  ).all<Record<string, string | number | null>>();
  return results;
}

const repository = new D1QuoteRepository(env.DB);
const today = parsePublicationDate('2026-10-18');

beforeEach(async () => {
  await resetDatabase();
});

describe('seeding the curated collection', () => {
  it('stores every quote exactly as written and converges when run again', async () => {
    await seed(COLLECTION);
    const once = await rows();
    await seed(COLLECTION);

    expect(await rows()).toEqual(once);
    expect(once).toHaveLength(COLLECTION.length);
    const multiline = COLLECTION.find((entry) => entry.quote.text.includes('\n'));
    const stored = once.find((row) => row.id === multiline?.quote.id);
    expect(stored?.text).toBe(multiline?.quote.text);
  });

  it('disables quotes removed from the collection without touching their history', async () => {
    await seed(COLLECTION);
    const published = await Effect.runPromise(ensurePublication({ repository, date: today }));

    await seed(COLLECTION.filter((entry) => entry.quote.id !== published.quote.id));

    const removed = (await rows()).find((row) => row.id === published.quote.id);
    expect(removed?.enabled).toBe(0);
    expect(await Effect.runPromise(repository.findPublication(today))).toEqual(published);
  });

  it('applies text corrections in place', async () => {
    await seed(COLLECTION);
    const [first, ...rest] = COLLECTION;
    if (!first) throw new Error('empty collection');
    const corrected: CollectionEntry = {
      ...first,
      quote: { ...first.quote, text: 'Corrected text.' },
    };

    await seed([corrected, ...rest]);

    expect((await rows()).find((row) => row.id === first.quote.id)?.text).toBe('Corrected text.');
  });

  it('refuses to move a quote to another category and leaves the table unchanged', async () => {
    await seed(COLLECTION);
    const before = await rows();
    const verse = COLLECTION.find((entry) => entry.quote.category === 'bible');
    if (!verse) throw new Error('no verse in collection');
    const moved: CollectionEntry = {
      enabled: true,
      quote: {
        category: 'general',
        id: verse.quote.id,
        text: verse.quote.text,
        author: 'Someone',
        source: 'Somewhere',
      },
    };

    await expect(
      seed(COLLECTION.map((entry) => (entry.quote.id === verse.quote.id ? moved : entry))),
    ).rejects.toThrow(/CHECK/);
    expect(await rows()).toEqual(before);
  });
});
