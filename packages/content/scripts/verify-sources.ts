/**
 * Downloads every cited source text and checks that each quote appears in it.
 *
 * General quotes may differ from their source only typographically: curly versus straight quotes,
 * dashes, italics markers, translator brackets, line breaks, the case of the first letter, and the
 * final punctuation mark of an excerpt. Bible verses must be exact excerpts of the cited passage,
 * because the World English Bible may only be called by that name when its text is unchanged.
 *
 * A source site that answers 503 is down for maintenance, not evidence against a quote, so the
 * quotes citing it are reported as unverified instead of failing the run.
 *
 * Usage: bun run content:verify-sources [--refresh]
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { BIBLE_VERSES, GENERAL_QUOTES, SOURCES, type SourceId } from '../src';

const CACHE_DIR = new URL('../.cache/sources/', import.meta.url);
const REFRESH = process.argv.includes('--refresh');

async function download(id: SourceId): Promise<string | undefined> {
  const source = SOURCES[id];
  const extension = source.format === 'ebible-vpl-zip' ? 'zip' : 'txt';
  const cached = new URL(`${id}.${extension}`, CACHE_DIR);
  if (REFRESH || !existsSync(cached)) {
    const response = await fetch(source.url, {
      headers: { 'User-Agent': 'SomeQuote content verification (one-off, cached)' },
    });
    if (response.status === 503) return undefined;
    if (!response.ok) throw new Error(`${id}: ${response.status} fetching ${source.url}`);
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cached, Buffer.from(await response.arrayBuffer()));
  }
  if (source.format === 'ebible-vpl-zip') {
    return execFileSync('unzip', ['-p', cached.pathname, 'eng-web_vpl.txt'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  }
  const raw = await readFile(cached, 'utf8');
  return source.format === 'html' ? htmlToText(raw) : raw;
}

function htmlToText(html: string): string {
  return html
    .replace(/<sup[^>]*class="[^"]*reference[^"]*"[^>]*>[\s\S]*?<\/sup>/g, '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, '')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&');
}

function typographic(text: string): string {
  return text
    .replace(/[​﻿]/g, '')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/—|―|--/g, '—')
    .replace(/[_[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function quoteCore(text: string): string {
  return typographic(text).replace(/[.,;:!?]+["']?$/, '');
}

function appearsIn(source: string, text: string): boolean {
  const core = quoteCore(text);
  const variants = [core, core.charAt(0).toLowerCase() + core.slice(1)];
  return variants.some((variant) => source.includes(variant));
}

function versesOf(vpl: string): Map<string, string> {
  const verses = new Map<string, string>();
  for (const line of vpl.split('\n')) {
    const match = /^(\S+ \d+:\d+) (.*)$/.exec(line.trim());
    if (match?.[1] && match[2] !== undefined) verses.set(match[1], match[2].trim());
  }
  return verses;
}

function passageText(verses: Map<string, string>, passage: string): string | undefined {
  const match = /^(\S+) (\d+):(\d+)(?:-(\d+))?$/.exec(passage);
  if (!match) return undefined;
  const [, book, chapter, from, to] = match;
  const parts: string[] = [];
  for (let verse = Number(from); verse <= Number(to ?? from); verse++) {
    const text = verses.get(`${book} ${chapter}:${verse}`);
    if (text === undefined) return undefined;
    parts.push(text);
  }
  return parts.join(' ');
}

const failures: string[] = [];
const sourceText = new Map<SourceId, string>();
const unavailable = new Set<SourceId>();
const cited = new Set<SourceId>(GENERAL_QUOTES.map((entry) => entry.provenance.sourceId));
for (const id of cited) {
  const text = await download(id);
  if (text === undefined) unavailable.add(id);
  else sourceText.set(id, typographic(text));
}

let verified = 0;
for (const entry of GENERAL_QUOTES) {
  const source = sourceText.get(entry.provenance.sourceId);
  if (source === undefined) continue;
  verified++;
  if (!appearsIn(source, entry.text))
    failures.push(`${entry.id}: not found in ${entry.provenance.sourceId}`);
}

const bible = await download('world-english-bible');
if (bible === undefined) unavailable.add('world-english-bible');
else {
  const verses = versesOf(bible);
  for (const entry of BIBLE_VERSES) {
    verified++;
    const passage = passageText(verses, entry.passage);
    if (passage === undefined) failures.push(`${entry.id}: passage ${entry.passage} not found`);
    else if (!passage.replace(/\s+/g, ' ').includes(entry.text)) {
      failures.push(`${entry.id}: not an exact excerpt of ${entry.passage}`);
    }
  }
}

const checked = GENERAL_QUOTES.length + BIBLE_VERSES.length;
if (failures.length > 0) {
  console.error(
    `${failures.length} of ${checked} quotes failed verification:\n${failures.join('\n')}`,
  );
  process.exit(1);
}
for (const id of unavailable) {
  const message = `${id} is down for maintenance (503) at ${SOURCES[id].url}; its quotes were not verified.`;
  console.warn(process.env.GITHUB_ACTIONS ? `::warning::${message}` : message);
}
console.log(`Verified ${verified} of ${checked} quotes against their source texts.`);
