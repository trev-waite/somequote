import { isAttributionText, isQuoteId, QUOTE_TEXT_MAX_LENGTH } from '@somequote/domain';
import { attributionUrl } from './attributions';
import type { BibleEntry } from './quotes/bible';
import type { GeneralEntry } from './quotes/general';
import type { SportsEntry } from './quotes/sports';

const MIN_QUOTE_LENGTH = 16;
const MAX_QUOTE_LINES = 8;

/** Characters verified to exist in the Instrument Serif file the quote is set in. */
const SUPPORTED_CHARACTERS = /^[A-Za-z0-9 \n.,;:!?’‘“”—–\-()&éèêëàâäöüçñíóúæœÆŒÉÁÜÖ]*$/;
const STARTS_LIKE_A_SENTENCE = /^[A-Z’“]/;
const ENDS_LIKE_A_SENTENCE = /[.!?][’”]?$/;
const REFERENCE_PATTERN = /^(?:[1-3] )?[A-Z][a-z]+(?: of [A-Z][a-z]+)? (\d+):(\d+)(?:–(\d+))?$/;
const ATTESTED_PATTERN = /^[A-Z][^,]*,.* (?:18|19|20)\d{2}$/;
const PASSAGE_PATTERN = /^[1-3A-Z]{3} (\d+):(\d+)(?:-(\d+))?$/;

export interface ContentEntries {
  readonly general: readonly GeneralEntry[];
  readonly sports: readonly SportsEntry[];
  readonly bible: readonly BibleEntry[];
}

export function findContentProblems({ general, sports, bible }: ContentEntries): string[] {
  const problems: string[] = [];
  const report = (id: string, problem: string) => problems.push(`${id}: ${problem}`);
  const all = [...general, ...sports, ...bible];

  for (const entry of all) {
    if (!isQuoteId(entry.id)) report(entry.id, 'id must be lowercase words joined by hyphens');
    for (const problem of textProblems(entry.text)) report(entry.id, problem);
  }
  for (const entry of [...general, ...sports]) {
    if (!attributionUrl({ category: 'general', author: entry.author })) {
      report(entry.id, 'author must have a verified Grokipedia entry in attributions.ts');
    }
    for (const [field, value] of [
      ['author', entry.author],
      ['source', entry.source],
    ] as const) {
      if (value.trim() !== value || value.length === 0)
        report(entry.id, `${field} must be trimmed text`);
      if (!isAttributionText(value)) report(entry.id, `${field} must be short, visible text`);
      if (/['"]/.test(value)) report(entry.id, `${field} must use typographic quotes`);
    }
  }
  for (const entry of sports) {
    if (!ATTESTED_PATTERN.test(entry.attested)) {
      report(entry.id, 'attested must say where it was said and end with the year');
    }
  }
  for (const entry of bible) {
    if (!attributionUrl({ category: 'bible', reference: entry.reference })) {
      report(entry.id, 'Bible book must have a verified Grokipedia entry in attributions.ts');
    }
    for (const problem of verseProblems(entry)) report(entry.id, problem);
  }

  for (const id of duplicates(all.map((entry) => entry.id))) {
    report(id, 'id is used more than once');
  }
  for (const text of duplicates(all.map((entry) => entry.text.toLowerCase()))) {
    report(text.slice(0, 40), 'text appears more than once');
  }
  return problems;
}

function textProblems(text: string): string[] {
  const problems: string[] = [];
  if (text.length < MIN_QUOTE_LENGTH || text.length > QUOTE_TEXT_MAX_LENGTH) {
    problems.push(`text must be ${MIN_QUOTE_LENGTH}–${QUOTE_TEXT_MAX_LENGTH} characters`);
  }
  if (text.split('\n').length > MAX_QUOTE_LINES)
    problems.push(`text must fit in ${MAX_QUOTE_LINES} lines`);
  if (text.split('\n').some((line) => line.trim() !== line || line.length === 0)) {
    problems.push('lines must be trimmed and non-empty');
  }
  if (/ {2}|\t/.test(text)) problems.push('text must use single spaces');
  if (/['"]|--/.test(text)) problems.push('text must use typographic quotes and dashes');
  if (!SUPPORTED_CHARACTERS.test(text)) problems.push('text uses a character the quote font lacks');
  if (!STARTS_LIKE_A_SENTENCE.test(text)) problems.push('text must start with a capital letter');
  if (!ENDS_LIKE_A_SENTENCE.test(text)) problems.push('text must end with terminal punctuation');
  return problems;
}

function verseProblems(entry: BibleEntry): string[] {
  const problems: string[] = [];
  const reference = REFERENCE_PATTERN.exec(entry.reference);
  const passage = PASSAGE_PATTERN.exec(entry.passage);
  if (!reference) problems.push('reference must look like “Book 1:2” or “Book 1:2–3”');
  if (!passage) problems.push('passage must look like “BOO 1:2” or “BOO 1:2-3”');
  if (reference && passage && reference.slice(1).join() !== passage.slice(1).join()) {
    problems.push('reference and passage must cite the same verses');
  }
  if (entry.id !== `web-${slugify(entry.reference)}`) {
    problems.push(`id must be web-${slugify(entry.reference)}`);
  }
  if (entry.text.includes('\n')) problems.push('verses are prose and must not contain line breaks');
  return problems;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}
