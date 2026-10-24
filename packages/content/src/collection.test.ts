import { describe, expect, it } from 'vitest';
import { COLLECTION } from './collection';
import { BIBLE_VERSES, type BibleEntry } from './quotes/bible';
import { GENERAL_QUOTES, type GeneralEntry } from './quotes/general';
import { SPORTS_QUOTES, type SportsEntry } from './quotes/sports';
import { SOURCES } from './sources';
import { findContentProblems } from './validate';

const validGeneral: GeneralEntry = {
  id: 'example-quote',
  text: 'Nothing great was ever achieved without enthusiasm.',
  author: 'Ralph Waldo Emerson',
  source: 'Circles',
  provenance: { sourceId: 'gutenberg-2944', locator: 'Circles' },
};

const validSports: SportsEntry = {
  id: 'lou-gehrig-example',
  text: 'Today I consider myself the luckiest man on the face of this earth.',
  author: 'Lou Gehrig',
  source: 'Farewell speech, 1939',
  attested: 'Yankee Stadium, New York, July 4, 1939',
};

const validVerse: BibleEntry = {
  id: 'web-psalm-23-1',
  reference: 'Psalm 23:1',
  passage: 'PSA 23:1',
  text: 'Yahweh is my shepherd; I shall lack nothing.',
};

const problemsFor = (entries: {
  general?: GeneralEntry[];
  sports?: SportsEntry[];
  bible?: BibleEntry[];
}) =>
  findContentProblems({
    general: entries.general ?? [],
    sports: entries.sports ?? [],
    bible: entries.bible ?? [],
  });

describe('the curated collection', () => {
  it('satisfies every editorial rule', () => {
    expect(
      findContentProblems({ general: GENERAL_QUOTES, sports: SPORTS_QUOTES, bible: BIBLE_VERSES }),
    ).toEqual([]);
  });

  it('holds roughly four general quotes for every Bible verse', () => {
    const generalShare =
      COLLECTION.filter((entry) => entry.quote.category === 'general').length / COLLECTION.length;
    expect(generalShare).toBeGreaterThan(0.75);
    expect(generalShare).toBeLessThan(0.85);
  });

  it('cites a source for every quote and uses every listed source', () => {
    const cited = new Set([
      ...GENERAL_QUOTES.map((entry) => entry.provenance.sourceId),
      ...(BIBLE_VERSES.length > 0 ? ['world-english-bible'] : []),
    ]);
    expect([...cited].sort()).toEqual(Object.keys(SOURCES).sort());
  });
});

describe('editorial rules', () => {
  it('accepts well-formed entries', () => {
    expect(
      problemsFor({ general: [validGeneral], sports: [validSports], bible: [validVerse] }),
    ).toEqual([]);
  });

  it.each([
    ['straight quotes', { text: 'It isn\'t "so" here.' }, 'typographic quotes'],
    ['a missing final stop', { text: 'Nothing great was ever achieved' }, 'terminal punctuation'],
    ['a lowercase opening', { text: 'nothing great was ever achieved.' }, 'capital letter'],
    ['a glyph the font lacks', { text: 'Nothing great was ever achieved ½.' }, 'font lacks'],
    ['an overlong text', { text: `${'Long words. '.repeat(40)}End.` }, 'characters'],
    ['an invalid id', { id: 'Not An Id' }, 'id must be'],
    ['an empty author', { author: '' }, 'author must be trimmed'],
    ['an unlinked author', { author: 'New Author' }, 'verified Grokipedia entry'],
    ['an overlong source', { source: 'Essays '.repeat(12).trim() }, 'source must be short'],
    ['a bidi override in the author', { author: 'Ralph\u202EWaldo' }, 'author must be short'],
  ])('rejects %s', (_, override, expected) => {
    const problems = problemsFor({ general: [{ ...validGeneral, ...override }] });
    expect(problems.join('\n')).toContain(expected);
  });

  it.each(['Farewell speech', '1939', 'Yankee Stadium, 1939, New York'])(
    'rejects a sports quote attested only as %s',
    (attested) => {
      const problems = problemsFor({ sports: [{ ...validSports, attested }] });
      expect(problems.join('\n')).toContain('end with the year');
    },
  );

  it('rejects a sports quote that repeats a general quote', () => {
    const problems = problemsFor({
      general: [validGeneral],
      sports: [{ ...validSports, id: validGeneral.id, text: validGeneral.text }],
    }).join('\n');
    expect(problems).toContain('id is used more than once');
    expect(problems).toContain('text appears more than once');
  });

  it('rejects duplicate ids and duplicate texts', () => {
    const problems = problemsFor({ general: [validGeneral, validGeneral] }).join('\n');
    expect(problems).toContain('id is used more than once');
    expect(problems).toContain('text appears more than once');
  });

  it('rejects a verse whose reference and passage disagree', () => {
    const problems = problemsFor({ bible: [{ ...validVerse, passage: 'PSA 23:2' }] });
    expect(problems.join('\n')).toContain('same verses');
  });

  it('rejects a verse from a book without a curated link', () => {
    const problems = problemsFor({ bible: [{ ...validVerse, reference: 'Unknown 1:1' }] });
    expect(problems.join('\n')).toContain('Bible book must have a verified Grokipedia entry');
  });

  it('derives verse ids from their reference', () => {
    const problems = problemsFor({ bible: [{ ...validVerse, id: 'psalm-twenty-three' }] });
    expect(problems.join('\n')).toContain('id must be web-psalm-23-1');
  });
});
