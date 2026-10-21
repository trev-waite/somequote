/**
 * Checks the production build before it is tested or deployed: only expected files are published
 * as static assets, and the shipped JavaScript and CSS stay within their compressed size budgets.
 *
 * Usage: bun scripts/check-build.ts (after `bun run build`)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const CLIENT = fileURLToPath(new URL('../dist/client/', import.meta.url));

/** Every file Workers Static Assets may serve publicly. Anything else fails the build. */
const PUBLIC_FILES = [
  /^index\.html$/,
  /^_headers$/,
  /^robots\.txt$/,
  /^favicon\.svg$/,
  /^og-image\.png$/,
  /^color-scheme\.js$/,
  /^assets\/index-[\w-]+\.(?:js|css)$/,
  /^fonts\/[\w-]+\.(?:woff2|txt)$/,
];

/** Raise a budget deliberately, in the same change that needs it. */
const GZIP_BUDGETS = { js: 110_000, css: 6_000 };

/** `.assetsignore` keeps the generated Worker config and local secrets out of public assets. */
const REQUIRED_IGNORES = ['wrangler.json', '.dev.vars'];

function filesIn(directory: string, prefix = ''): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${prefix}${entry.name}`;
    return entry.isDirectory() ? filesIn(`${directory}${entry.name}/`, `${path}/`) : [path];
  });
}

const problems: string[] = [];

const ignorePath = `${CLIENT}.assetsignore`;
const ignored = existsSync(ignorePath) ? readFileSync(ignorePath, 'utf8').split('\n') : [];
for (const name of REQUIRED_IGNORES) {
  if (!ignored.includes(name)) problems.push(`.assetsignore does not exclude ${name}`);
}

const published = filesIn(CLIENT).filter(
  (path) => path !== '.assetsignore' && !ignored.includes(path),
);
for (const path of published) {
  if (!PUBLIC_FILES.some((pattern) => pattern.test(path))) {
    problems.push(`unexpected public asset: ${path}`);
  }
}

for (const [extension, budget] of Object.entries(GZIP_BUDGETS)) {
  const files = published.filter((path) => path.startsWith('assets/') && path.endsWith(extension));
  if (files.length === 0) problems.push(`no ${extension} bundle in assets/`);
  const bytes = files.reduce((sum, path) => sum + gzipSync(readFileSync(CLIENT + path)).length, 0);
  const raw = files.reduce((sum, path) => sum + statSync(CLIENT + path).size, 0);
  console.log(`${extension}: ${raw} bytes, ${bytes} gzipped (budget ${budget})`);
  if (bytes > budget) problems.push(`${extension} is ${bytes} bytes gzipped, over ${budget}`);
}

if (problems.length > 0) {
  console.error(problems.map((problem) => `error  ${problem}`).join('\n'));
  process.exit(1);
}
console.log(`${published.length} public assets, all expected.`);
