import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { annotation, scanCommits } from './cli';

const token = `cfat_${'Qx7'.repeat(14)}0a1b2c3d`;
const legacy = 'aZ3kQ9mW7xP2'.repeat(4).slice(0, 40);
let repo: string;

/** Independent of the developer's global git config (signing, hooks). */
const GIT_CONFIG = ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false'];
const git = (...args: string[]) =>
  execFileSync('git', [...GIT_CONFIG, ...args], { cwd: repo, encoding: 'utf8' }).trim();

function commit(files: Record<string, string | null>, message: string): string {
  for (const [path, content] of Object.entries(files)) {
    if (content === null) {
      rmSync(join(repo, path));
    } else {
      mkdirSync(dirname(join(repo, path)), { recursive: true });
      writeFileSync(join(repo, path), content);
    }
  }
  git('add', '-A');
  git('commit', '-q', '--allow-empty', '-m', message);
  return git('rev-parse', 'HEAD');
}

const scan = (base?: string, head = 'HEAD') => scanCommits(base, head, repo);
const locations = () => scan().map((f) => (f.kind === 'file' ? [f.path, f.line, f.rule] : f.rule));

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'secret-scan-'));
  git('init', '-q');
  git('config', 'core.hooksPath', '/dev/null');
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('scanCommits', () => {
  it('finds a secret that a later commit deleted, at the line and commit that added it', () => {
    commit({ 'README.md': 'hello\n' }, 'start');
    const leaked = commit({ 'config.ts': `// settings\nconst cf = '${token}';\n` }, 'leak');
    commit({ 'config.ts': '// settings\n' }, 'remove it');

    expect(scan()).toEqual([
      {
        kind: 'file',
        commit: leaked,
        path: 'config.ts',
        line: 2,
        rule: 'cloudflare-credential',
        excerpt: 'cfat_…',
      },
    ]);
  });

  it('reports a re-added secret at the commit that first added it', () => {
    const first = commit({ 'a.ts': `${token}\n` }, 'add');
    commit({ 'a.ts': null }, 'delete');
    commit({ 'a.ts': `${token}\n` }, 'add again');

    expect(scan().map((f) => f.commit)).toEqual([first]);
  });

  it('scans only commits after the base', () => {
    commit({ 'old.ts': `const cf = '${token}';\n` }, 'already reviewed');
    const base = commit({ 'README.md': 'hello\n' }, 'base');
    commit({ 'new.ts': 'export {};\n' }, 'clean change');

    expect(scan(base)).toEqual([]);
    expect(scan()).toHaveLength(1);
  });

  it('scans the pushed commit rather than whatever is checked out', () => {
    const base = commit({ 'README.md': 'hello\n' }, 'base');
    const pushed = commit({ 'leak.ts': `const cf = '${token}';\n` }, 'leak');
    git('checkout', '-q', base);

    expect(scan(base, pushed)).toHaveLength(1);
  });

  it('rejects committed credential files, including binary ones', () => {
    commit({ '.dev.vars': 'NAME=value\n', 'store.p12': '\u0000\u0001binary' }, 'oops');

    expect(locations()).toEqual([
      ['.dev.vars', undefined, 'private-file'],
      ['store.p12', undefined, 'private-file'],
    ]);
  });

  it('reads files git considers binary', () => {
    commit({ 'blob.bin': `\u0000header ${token}\n` }, 'binary');
    expect(locations()).toEqual([['blob.bin', 1, 'cloudflare-credential']]);
  });

  it.each(['my file.ts', 'café.ts', 'a"b.ts', 'tab\there.ts', 'back\\slash.ts'])(
    'reports the right path for %s',
    (path) => {
      commit({ 'clean.ts': 'export {};\n' }, 'clean');
      commit({ [path]: `${token}\n` }, 'leak');
      expect(locations()).toEqual([[path, 1, 'cloudflare-credential']]);
    },
  );

  it('ignores git settings that change the diff format', () => {
    git('config', 'diff.noprefix', 'true');
    git('config', 'core.bigFileThreshold', '10');
    git('config', 'core.quotePath', 'true');
    commit({ 'naïve.ts': `// a long enough file\n${token}\n` }, 'leak');

    expect(locations()).toEqual([['naïve.ts', 2, 'cloudflare-credential']]);
  });

  it('finds a value on the line after a YAML block indicator', () => {
    commit({ 'config.yml': `cloudflare:\n  api_token: |\n    ${legacy}\n` }, 'yaml');
    expect(locations()).toEqual([['config.yml', 3, 'secret-assignment']]);
  });

  it('finds a quoted value on the line after a bare name', () => {
    commit({ 'config.json': `{\n  "password":\n    "${legacy}"\n}\n` }, 'json');
    expect(locations()).toEqual([['config.json', 3, 'secret-assignment']]);
  });

  it('ignores a nested map under a bare name', () => {
    commit({ 'config.yml': 'database_password:\n  name: db1-credentials-v2\n' }, 'yaml');
    expect(locations()).toEqual([]);
  });

  it('finds a replaced value under an unchanged YAML block indicator', () => {
    commit({ 'config.yml': 'cloudflare:\n  api_token: |\n    placeholder\n' }, 'template');
    const leaked = commit({ 'config.yml': `cloudflare:\n  api_token: |\n    ${legacy}\n` }, 'fill');

    expect(scan()).toEqual([
      expect.objectContaining({ commit: leaked, path: 'config.yml', line: 3 }),
    ]);
  });

  it('scans commit messages', () => {
    const leaked = commit({}, `deploy with ${token}`);
    expect(scan()).toEqual([
      {
        kind: 'message',
        commit: leaked,
        line: 1,
        rule: 'cloudflare-credential',
        excerpt: 'cfat_…',
      },
    ]);
  });

  it('scans the message of an annotated tag passed as the head', () => {
    commit({ 'README.md': 'hello\n' }, 'start');
    git('tag', '-a', 'v1', '-m', `release notes\n\n${token}`);
    const tag = git('rev-parse', 'v1');

    expect(scan(undefined, 'v1')).toEqual([
      { kind: 'message', commit: tag, line: 3, rule: 'cloudflare-credential', excerpt: 'cfat_…' },
    ]);
  });

  it('refuses a base that is not a commit', () => {
    commit({ 'README.md': 'hello\n' }, 'start');
    expect(() => scan('--output=/tmp/x')).toThrow();
  });
});

describe('annotation', () => {
  it('escapes paths and messages for GitHub workflow commands', () => {
    expect(
      annotation({
        kind: 'file',
        commit: 'abc',
        path: 'dir/a,b:c%d\ne.ts',
        line: 3,
        rule: 'jwt',
        excerpt: 'eyJ…',
      }),
    ).toBe('::error file=dir/a%2Cb%3Ac%25d%0Ae.ts,line=3,title=Secret scan::jwt in commit abc');
    expect(
      annotation({ kind: 'message', commit: 'abc', line: 1, rule: 'jwt', excerpt: 'eyJ…' }),
    ).toBe('::error title=Secret scan::jwt in message of abc');
  });
});
