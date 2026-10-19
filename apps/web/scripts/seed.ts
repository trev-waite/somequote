/**
 * Makes the D1 `quotes` table match the curated collection in @somequote/content.
 * Idempotent: run it after every content change. Publication history is never touched.
 *
 * Usage: bun scripts/seed.ts --local | --remote
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BIBLE_VERSES, COLLECTION, findContentProblems, GENERAL_QUOTES } from '@somequote/content';
import { seedStatements } from '../src/worker/seed-sql';

const target = process.argv.includes('--remote') ? '--remote' : '--local';

const problems = findContentProblems({ general: GENERAL_QUOTES, bible: BIBLE_VERSES });
if (problems.length > 0) {
  console.error(`The collection has ${problems.length} problem(s):\n${problems.join('\n')}`);
  process.exit(1);
}

const seedFile = fileURLToPath(new URL('../.wrangler/seed.sql', import.meta.url));
mkdirSync(fileURLToPath(new URL('../.wrangler/', import.meta.url)), { recursive: true });
writeFileSync(seedFile, `${seedStatements(COLLECTION).join('\n\n')}\n`);

const result = spawnSync(
  'wrangler',
  ['d1', 'execute', 'somequote', target, '--file', seedFile, '--yes'],
  { stdio: 'inherit' },
);
if (result.status === 0) {
  console.log(`Seeded ${COLLECTION.length} quotes (${target.slice(2)}).`);
}
process.exit(result.status ?? 1);
