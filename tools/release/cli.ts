import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function readVersion(source: string): string | undefined {
  const version: unknown = JSON.parse(source).version;
  if (version === undefined) return undefined;
  if (
    typeof version !== 'string' ||
    !VERSION.test(version) ||
    !version.split('.').every((part) => Number.isSafeInteger(Number(part)))
  ) {
    throw new Error('package.json needs a stable major.minor.patch version without leading zeros.');
  }
  return version;
}

function compare(left: string, right: string): number {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < 3; index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export function checkRelease(base?: string, cwd = process.cwd()): string {
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const version = readVersion(readFileSync(join(cwd, 'package.json'), 'utf8'));
  if (version === undefined) throw new Error('package.json needs a release version.');

  if (base) {
    const commit = git('rev-parse', '--verify', '--end-of-options', `${base}^{commit}`);
    const changed = git('diff', '--no-renames', '--name-only', '-z', commit, '--')
      .split('\0')
      .filter(Boolean);
    if (changed.every((path) => path.endsWith('.md'))) return version;
    const previous = readVersion(git('show', `${commit}:package.json`));
    if (previous !== undefined && compare(version, previous) <= 0) {
      throw new Error(`Version ${version} must be newer than base ${previous}. Bump package.json.`);
    }
  }

  const head = git('rev-parse', 'HEAD');
  for (const tag of git('tag', '--list', 'v*').split('\n')) {
    const released = tag.slice(1);
    if (!VERSION.test(released)) continue;
    const difference = compare(version, released);
    if (difference < 0) throw new Error(`Version ${version} is older than released ${tag}.`);
    if (difference === 0 && git('rev-parse', `${tag}^{commit}`) !== head) {
      throw new Error(`${tag} already belongs to another commit. Bump package.json.`);
    }
  }
  return version;
}

if (import.meta.main) {
  try {
    console.log(`Release v${checkRelease(process.env.RELEASE_BASE_REF)} is ready.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
