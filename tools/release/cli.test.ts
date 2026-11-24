import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkRelease } from './cli';

let repo: string;
const git = (...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args],
    { cwd: repo, encoding: 'utf8' },
  ).trim();

function commit(version: unknown, files: Record<string, string> = {}): string {
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ version }));
  for (const [path, content] of Object.entries(files)) writeFileSync(join(repo, path), content);
  git('add', '-A');
  git('commit', '-q', '--allow-empty', '-m', 'change');
  return git('rev-parse', 'HEAD');
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'somequote-release-'));
  git('init', '-q');
  git('config', 'core.hooksPath', '/dev/null');
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('checkRelease', () => {
  it('introduces versioning to a repository without a previous version', () => {
    const base = commit(undefined);
    commit('1.0.0');
    expect(checkRelease(base, repo)).toBe('1.0.0');
  });

  it.each(['1.0.1', '1.1.0', '2.0.0', '1.10.0'])('accepts a reviewed increase to %s', (version) => {
    const base = commit('1.0.0');
    commit(version);
    expect(checkRelease(base, repo)).toBe(version);
  });

  it.each(['1.0.0', '0.9.0'])('rejects deployable changes without an increase (%s)', (version) => {
    const base = commit('1.0.0');
    commit(version, { 'worker.ts': 'export {};' });
    expect(() => checkRelease(base, repo)).toThrow('must be newer than base');
  });

  it('allows Markdown-only changes without a new version after a release', () => {
    const base = commit('1.0.0');
    git('tag', 'v1.0.0');
    commit('1.0.0', { 'README.md': 'Documentation update' });
    expect(checkRelease(base, repo)).toBe('1.0.0');
    expect(() => checkRelease(undefined, repo)).toThrow('already belongs to another commit');
  });

  it('rejects reusing a tag from another commit before deployment', () => {
    commit('1.0.0');
    git('tag', 'v1.0.0');
    commit('1.0.0', { 'worker.ts': 'export {};' });
    expect(() => checkRelease(undefined, repo)).toThrow('already belongs to another commit');
  });

  it('requires a bump when source code is renamed to a Markdown file', () => {
    const base = commit('1.0.0', { 'worker.ts': 'export {};' });
    git('mv', 'worker.ts', 'worker.md');
    commit('1.0.0');
    expect(() => checkRelease(base, repo)).toThrow('must be newer than base');
  });

  it('allows rerunning the exact tagged commit, including an annotated tag', () => {
    commit('1.0.0');
    git('tag', '-a', 'v1.0.0', '-m', 'release');
    expect(checkRelease(undefined, repo)).toBe('1.0.0');
  });

  it('compares numeric versions against every release tag', () => {
    commit('1.10.0');
    git('tag', 'v1.10.0');
    commit('1.9.0');
    expect(() => checkRelease(undefined, repo)).toThrow('older than released v1.10.0');
  });

  it.each([undefined, 1, '1.0', 'v1.0.0', '01.0.0', '1.0.0-beta.1', '9007199254740992.0.0'])(
    'rejects an invalid stable version: %s',
    (version) => {
      commit(version);
      expect(() => checkRelease(undefined, repo)).toThrow(/needs a .*version/);
    },
  );
});
