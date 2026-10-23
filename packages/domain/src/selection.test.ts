import { describe, expect, it } from 'vitest';
import { addDays, type PublicationDate, parsePublicationDate } from './publication-clock';
import { CATEGORIES, type Category, parseQuoteId, type QuoteId } from './quote';
import {
  type QuoteUsage,
  type Random,
  ROTATION_LENGTH,
  type SelectionSnapshot,
  selectQuote,
} from './selection';
import { seededRandom } from './testing';

interface CollectionQuote {
  readonly id: QuoteId;
  readonly category: Category;
}

interface PublishedDay {
  readonly date: PublicationDate;
  readonly id: QuoteId;
  readonly category: Category;
}

function collection(counts: Readonly<Record<Category, number>>): CollectionQuote[] {
  return CATEGORIES.flatMap((category) =>
    Array.from({ length: counts[category] }, (_, index) => ({
      id: parseQuoteId(`${category}-${index}`),
      category,
    })),
  );
}

function snapshotFrom(
  enabled: readonly CollectionQuote[],
  history: readonly PublishedDay[],
): SelectionSnapshot {
  const candidates: QuoteUsage[] = enabled.map((quote) => {
    const days = history.filter((day) => day.id === quote.id);
    return {
      id: quote.id,
      category: quote.category,
      timesPublished: days.length,
      lastPublishedOn: days.at(-1)?.date ?? null,
    };
  });
  return {
    candidates,
    publishedCount: history.length,
    recentCategories: history
      .slice(-(ROTATION_LENGTH - 1))
      .map((day) => day.category)
      .reverse(),
  };
}

function simulate({
  enabled,
  days,
  random,
  history = [],
}: {
  enabled: readonly CollectionQuote[];
  days: number;
  random: Random;
  history?: readonly PublishedDay[];
}): PublishedDay[] {
  const result = [...history];
  let date = result.at(-1)?.date ?? parsePublicationDate('2026-01-01');
  const byId = new Map(enabled.map((quote) => [quote.id, quote]));
  for (let day = 0; day < days; day++) {
    date = result.length === 0 ? date : addDays(date, 1);
    const id = selectQuote(snapshotFrom(enabled, result), random);
    const quote = id === null ? undefined : byId.get(id);
    if (!quote) throw new Error(`Nothing published on ${date}`);
    result.push({ date, id: quote.id, category: quote.category });
  }
  return result;
}

function rotations(history: readonly PublishedDay[]): PublishedDay[][] {
  const chunks: PublishedDay[][] = [];
  for (let start = 0; start < history.length; start += ROTATION_LENGTH) {
    chunks.push(history.slice(start, start + ROTATION_LENGTH));
  }
  return chunks;
}

const count = (days: readonly PublishedDay[], category: Category) =>
  days.filter((day) => day.category === category).length;

describe('category mix', () => {
  it('publishes four general quotes and one Bible verse in every rotation of five days', () => {
    const history = simulate({
      enabled: collection({ general: 100, bible: 25 }),
      days: 1000,
      random: seededRandom(1),
    });

    expect(count(history, 'general')).toBe(800);
    expect(count(history, 'bible')).toBe(200);
    for (const rotation of rotations(history)) {
      expect(count(rotation, 'bible')).toBe(1);
    }
  });

  it('places the Bible verse at an unpredictable position within each rotation', () => {
    const history = simulate({
      enabled: collection({ general: 100, bible: 25 }),
      days: 1000,
      random: seededRandom(2),
    });
    const positions = rotations(history).map((rotation) =>
      rotation.findIndex((day) => day.category === 'bible'),
    );

    for (let position = 0; position < ROTATION_LENGTH; position++) {
      const share = positions.filter((p) => p === position).length / positions.length;
      expect(share).toBeGreaterThan(0.12);
      expect(share).toBeLessThan(0.28);
    }
  });

  it('measures the mix from actual publications, not from collection size', () => {
    const history = simulate({
      enabled: collection({ general: 10, bible: 40 }),
      days: 200,
      random: seededRandom(3),
    });

    expect(count(history, 'bible')).toBe(40);
  });
});

describe('quote choice within a category', () => {
  it('never repeats a quote until every quote in its category has been published', () => {
    const history = simulate({
      enabled: collection({ general: 12, bible: 3 }),
      days: 150,
      random: seededRandom(4),
    });

    for (const [category, size] of [
      ['general', 12],
      ['bible', 3],
    ] as const) {
      const ids = history.filter((day) => day.category === category).map((day) => day.id);
      for (let cycle = 0; cycle + size <= ids.length; cycle += size) {
        expect(new Set(ids.slice(cycle, cycle + size)).size).toBe(size);
      }
    }
  });

  it('prefers the least published quote, then the least recently published one', () => {
    const usage = (id: string, timesPublished: number, last: string | null): QuoteUsage => ({
      id: parseQuoteId(id),
      category: 'general',
      timesPublished,
      lastPublishedOn: last === null ? null : parsePublicationDate(last),
    });
    const snapshot: SelectionSnapshot = {
      candidates: [
        usage('most-used', 3, '2026-01-01'),
        usage('used-recently', 1, '2026-03-01'),
        usage('used-longest-ago', 1, '2026-01-02'),
        usage('also-recent', 1, '2026-02-01'),
      ],
      publishedCount: 0,
      recentCategories: [],
    };

    for (const value of [0, 0.25, 0.5, 0.99]) {
      expect(selectQuote(snapshot, () => value)).toBe('used-longest-ago');
    }
  });

  it('breaks the remaining ties at random', () => {
    const enabled = collection({ general: 4, bible: 0 });
    const random = seededRandom(5);
    const picks = new Map<string, number>();
    for (let draw = 0; draw < 2000; draw++) {
      const id = selectQuote(snapshotFrom(enabled, []), random);
      picks.set(String(id), (picks.get(String(id)) ?? 0) + 1);
    }

    expect([...picks.keys()].sort()).toEqual(enabled.map((quote) => quote.id).sort());
    for (const times of picks.values()) expect(times).toBeGreaterThan(400);
  });
});

describe('shortages', () => {
  it('returns null when nothing is enabled', () => {
    expect(selectQuote(snapshotFrom([], []), seededRandom(6))).toBeNull();
  });

  it('fills a Bible slot with a general quote when no verse is enabled', () => {
    const history = simulate({
      enabled: collection({ general: 30, bible: 0 }),
      days: 20,
      random: seededRandom(7),
    });

    expect(count(history, 'general')).toBe(20);
  });

  it('resumes the usual mix after a shortage without a burst of catch-up verses', () => {
    const everything = collection({ general: 60, bible: 15 });
    const generalOnly = everything.filter((quote) => quote.category === 'general');
    const random = seededRandom(8);
    const shortage = simulate({ enabled: generalOnly, days: 52, random });
    const recovery = simulate({ enabled: everything, days: 100, random, history: shortage }).slice(
      shortage.length,
    );

    expect(count(recovery, 'bible')).toBeGreaterThanOrEqual(19);
    expect(count(recovery, 'bible')).toBeLessThanOrEqual(21);
    for (let start = 0; start + ROTATION_LENGTH <= recovery.length; start++) {
      expect(count(recovery.slice(start, start + ROTATION_LENGTH), 'bible')).toBeLessThanOrEqual(2);
    }
  });
});
