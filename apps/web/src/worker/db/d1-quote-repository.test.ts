import { env } from 'cloudflare:workers';
import {
  addDays,
  ensurePublication,
  NoEligibleQuoteError,
  type PublicationDate,
  parsePublicationDate,
  type QuoteRepository,
  ROTATION_LENGTH,
} from '@somequote/domain';
import { seededRandom } from '@somequote/domain/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bibleVerse,
  generalQuote,
  insertQuotes,
  publicationRows,
  quotes,
  resetDatabase,
  setEnabled,
} from '../test-support';
import { D1QuoteRepository } from './d1-quote-repository';

const repository = new D1QuoteRepository(env.DB);
const firstDay = parsePublicationDate('2026-10-18');

async function publishDays(days: number, from: PublicationDate = firstDay, seed = 1) {
  const random = seededRandom(seed);
  const published = [];
  for (let day = 0; day < days; day++) {
    published.push(await ensurePublication({ repository, date: addDays(from, day), random }));
  }
  return published;
}

beforeEach(async () => {
  await resetDatabase();
});

describe('publishing a day', () => {
  it('gives every caller the same quote for the same day', async () => {
    await insertQuotes(quotes('general', 20, generalQuote));

    const first = await ensurePublication({ repository, date: firstDay, random: seededRandom(1) });
    for (let visitor = 2; visitor <= 10; visitor++) {
      const again = await ensurePublication({
        repository,
        date: firstDay,
        random: seededRandom(visitor),
      });
      expect(again).toEqual(first);
    }
    expect(await publicationRows()).toHaveLength(1);
  });

  it('converges concurrent publishers on one stored publication', async () => {
    await insertQuotes(quotes('general', 40, generalQuote));
    const attempted = new Set<string>();
    const countingRepository: QuoteRepository = {
      findPublication: (date) => repository.findPublication(date),
      loadSelectionSnapshot: (options) => repository.loadSelectionSnapshot(options),
      listPublications: (query) => repository.listPublications(query),
      publishIfAbsent(input) {
        attempted.add(input.quoteId);
        return repository.publishIfAbsent(input);
      },
    };

    const results = await Promise.all(
      Array.from({ length: 25 }, (_, caller) =>
        ensurePublication({
          repository: countingRepository,
          date: firstDay,
          random: seededRandom(100 + caller),
        }),
      ),
    );

    const ids = new Set(results.map((publication) => publication.quote.id));
    expect(attempted.size).toBeGreaterThan(1);
    expect(ids.size).toBe(1);
    expect(await publicationRows()).toEqual([{ publish_date: firstDay, quote_id: [...ids][0] }]);
  });

  it('retries with another quote when the chosen one is disabled before it is recorded', async () => {
    await insertQuotes(quotes('general', 5, generalQuote));
    let interfered = false;
    const racingRepository: QuoteRepository = {
      findPublication: (date) => repository.findPublication(date),
      loadSelectionSnapshot: (options) => repository.loadSelectionSnapshot(options),
      listPublications: (query) => repository.listPublications(query),
      async publishIfAbsent(input) {
        if (!interfered) {
          interfered = true;
          await setEnabled([input.quoteId], false);
        }
        return repository.publishIfAbsent(input);
      },
    };

    const publication = await ensurePublication({
      repository: racingRepository,
      date: firstDay,
      random: seededRandom(3),
    });

    const [disabled] = (
      await env.DB.prepare('SELECT id FROM quotes WHERE enabled = 0').all<{ id: string }>()
    ).results;
    expect(publication.quote.id).not.toBe(disabled?.id);
    expect(await publicationRows()).toHaveLength(1);
  });
});

describe('history-driven selection', () => {
  it('keeps one Bible verse in every five days and repeats nothing until a category is exhausted', async () => {
    await insertQuotes([...quotes('general', 12, generalQuote), ...quotes('verse', 3, bibleVerse)]);

    const published = await publishDays(60);

    for (let start = 0; start < published.length; start += ROTATION_LENGTH) {
      const rotation = published.slice(start, start + ROTATION_LENGTH);
      expect(rotation.filter((day) => day.quote.category === 'bible')).toHaveLength(1);
    }
    const generalIds = published
      .filter((day) => day.quote.category === 'general')
      .map((d) => d.quote.id);
    for (let cycle = 0; cycle + 12 <= generalIds.length; cycle += 12) {
      expect(new Set(generalIds.slice(cycle, cycle + 12)).size).toBe(12);
    }
  });

  it('derives usage counts and last-published dates from the stored history', async () => {
    await insertQuotes(quotes('general', 4, generalQuote));
    const published = await publishDays(10);

    const snapshot = await repository.loadSelectionSnapshot({ recentLimit: 4 });

    expect(snapshot.publishedCount).toBe(10);
    for (const usage of snapshot.candidates) {
      const days = published.filter((day) => day.quote.id === usage.id).map((day) => day.date);
      expect(usage.timesPublished).toBe(days.length);
      expect(usage.lastPublishedOn).toBe(days.at(-1) ?? null);
    }
    expect(snapshot.recentCategories).toEqual(['general', 'general', 'general', 'general']);
  });

  it('never selects disabled quotes', async () => {
    await insertQuotes(quotes('general', 10, generalQuote));
    await setEnabled(['general-1', 'general-2', 'general-3'], false);

    const published = await publishDays(14);

    const used = new Set(published.map((day) => day.quote.id));
    for (const disabled of ['general-1', 'general-2', 'general-3']) {
      expect(used.has(disabled as never)).toBe(false);
    }
  });

  it('keeps history and today’s publication when a published quote is disabled later', async () => {
    await insertQuotes(quotes('general', 3, generalQuote));
    const [first] = await publishDays(1);
    if (!first) throw new Error('nothing published');

    await setEnabled([first.quote.id], false);

    expect(await ensurePublication({ repository, date: firstDay })).toEqual(first);
    expect(await repository.listPublications({ before: null, limit: 10 })).toEqual([first]);
  });

  it('fills Bible slots with general quotes while no verse is enabled', async () => {
    await insertQuotes([...quotes('general', 10, generalQuote), ...quotes('verse', 2, bibleVerse)]);
    await setEnabled(['verse-1', 'verse-2'], false);

    const published = await publishDays(10);

    expect(published.every((day) => day.quote.category === 'general')).toBe(true);
  });

  it('reports that nothing can be published when every quote is disabled', async () => {
    await insertQuotes(quotes('general', 2, generalQuote));
    await setEnabled(['general-1', 'general-2'], false);

    await expect(ensurePublication({ repository, date: firstDay })).rejects.toBeInstanceOf(
      NoEligibleQuoteError,
    );
    expect(await publicationRows()).toEqual([]);
  });
});

describe('history pagination', () => {
  it('seeks to an old cursor without reading the newer history', async () => {
    await insertQuotes([generalQuote('general-1')]);
    await env.DB.prepare(`
      WITH RECURSIVE days(day) AS (
        SELECT 0 UNION ALL SELECT day + 1 FROM days WHERE day < 4095
      )
      INSERT INTO publications (publish_date, quote_id)
      SELECT date('2000-01-01', '+' || day || ' days'), 'general-1' FROM days
    `).run();
    const before = parsePublicationDate('2000-01-10');
    const prepare = vi.spyOn(env.DB, 'prepare');
    let sql: string | undefined;
    try {
      const page = await repository.listPublications({ before, limit: 3 });
      expect(page.map((item) => item.date)).toEqual(['2000-01-09', '2000-01-08', '2000-01-07']);
      sql = prepare.mock.calls[0]?.[0];
    } finally {
      prepare.mockRestore();
    }
    if (sql === undefined) throw new Error('No history query was executed');

    const { meta } = await env.DB.prepare(sql).bind(before, 3).all();

    expect(meta.rows_read).toBeLessThan(30);
    const newest = await repository.listPublications({ before: null, limit: 3 });
    expect(newest.map((item) => item.date)).toEqual(
      [4095, 4094, 4093].map((day) => addDays(parsePublicationDate('2000-01-01'), day)),
    );
  });
});

describe('database guarantees', () => {
  it('allows only one publication per date', async () => {
    await insertQuotes(quotes('general', 2, generalQuote));
    await env.DB.prepare(
      "INSERT INTO publications (publish_date, quote_id) VALUES ('2026-10-18', 'general-1')",
    ).run();

    await expect(
      env.DB.prepare(
        "INSERT INTO publications (publish_date, quote_id) VALUES ('2026-10-18', 'general-2')",
      ).run(),
    ).rejects.toThrow(/UNIQUE/);
  });

  it('keeps publication history permanent', async () => {
    await insertQuotes(quotes('general', 2, generalQuote));
    await publishDays(1);

    await expect(
      env.DB.prepare("UPDATE publications SET quote_id = 'general-2'").run(),
    ).rejects.toThrow(/permanent/);
    await expect(env.DB.prepare('DELETE FROM publications').run()).rejects.toThrow(/permanent/);
    await expect(
      env.DB.prepare("DELETE FROM quotes WHERE id LIKE 'general-%'").run(),
    ).rejects.toThrow(/FOREIGN KEY/);
  });

  it.each([
    ['not a date', 'tomorrow'],
    ['an impossible day', '2026-02-30'],
    ['a short form', '2026-1-1'],
    ['missing', null],
  ])('rejects a publication date that is %s', async (_, publishDate) => {
    await insertQuotes(quotes('general', 1, generalQuote));
    await expect(
      env.DB.prepare('INSERT INTO publications (publish_date, quote_id) VALUES (?1, ?2)')
        .bind(publishDate, 'general-1')
        .run(),
    ).rejects.toThrow(/CHECK|NOT NULL/);
  });

  it.each([
    ['a general quote without an author', "('a', 'general', 'Text.', NULL, 'Book', NULL, NULL)"],
    [
      'a general quote with a reference',
      "('a', 'general', 'Text.', 'Me', 'Book', 'John 1:1', NULL)",
    ],
    ['a verse without a reference', "('a', 'bible', 'Text.', NULL, NULL, NULL, 'WEB')"],
    ['an unknown category', "('a', 'poetry', 'Text.', 'Me', 'Book', NULL, NULL)"],
    ['empty text', "('a', 'general', '  ', 'Me', 'Book', NULL, NULL)"],
    ['an invalid id', "('Bad Id', 'general', 'Text.', 'Me', 'Book', NULL, NULL)"],
    ['a missing id', "(NULL, 'general', 'Text.', 'Me', 'Book', NULL, NULL)"],
  ])('rejects %s', async (_, values) => {
    await expect(
      env.DB.prepare(
        `INSERT INTO quotes (id, category, text, author, source, reference, translation) VALUES ${values}`,
      ).run(),
    ).rejects.toThrow(/CHECK|NOT NULL/);
  });
});
