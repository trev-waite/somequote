/**
 * Fails if commits add credentials or credential files. Every added line of every commit is
 * scanned, so a secret deleted in a later commit is still caught: it stays in history. Commit
 * messages, and the message of an annotated tag passed as <head>, are scanned too.
 *
 * Usage: bun tools/secret-scan/src/cli.ts [<base>] [<head>]
 *   <base>  scan <base>..<head>; empty or omitted scans all of <head>'s history
 *   <head>  a commit or tag; defaults to HEAD
 */
import { execFileSync } from 'node:child_process';
import { type Finding, scanLog, scanMessage } from './secrets';

/**
 * Pins the diff format the parser reads, whatever the developer's git config says: prefixes,
 * path quoting, binary detection (secrets in "binary" files are still text), and textconv.
 */
const DIFF_FORMAT = [
  '-c',
  'core.quotePath=false',
  '-c',
  'diff.noprefix=false',
  '-c',
  'core.bigFileThreshold=4g',
  'log',
  '--reverse',
  '--text',
  '--unified=1',
  '--src-prefix=a/',
  '--dst-prefix=b/',
  '--no-relative',
  '--no-color',
  '--no-ext-diff',
  '--no-textconv',
  '--no-renames',
  '--diff-merges=first-parent',
];

export function scanCommits(base?: string, head = 'HEAD', cwd = process.cwd()): Finding[] {
  const git = (args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1024 ** 3, stdio: 'pipe' });
  const resolve = (revision: string) =>
    git(['rev-parse', '--verify', '--end-of-options', revision]).trim();

  const headObject = resolve(head);
  const headCommit = resolve(`${headObject}^{commit}`);
  const range = base ? `${resolve(`${base}^{commit}`)}..${headCommit}` : headCommit;

  const files = scanLog(git([...DIFF_FORMAT, '-p', '--format=commit %H', range]));
  const messages = git(['log', '--reverse', '--no-patch', '--format=%H%x1f%B%x1e', range])
    .split('\x1e')
    .flatMap((entry) => {
      const [commit = '', message = ''] = entry.trim().split('\x1f');
      return commit ? scanMessage(commit, message) : [];
    });
  const tag =
    git(['cat-file', '-t', headObject]).trim() === 'tag'
      ? scanMessage(
          headObject,
          git(['cat-file', 'tag', headObject]).split('\n\n').slice(1).join('\n\n'),
        )
      : [];
  return [...files, ...messages, ...tag];
}

/** GitHub workflow-command escaping: data escapes %, CR, LF; properties also escape : and ,. */
export function annotation(finding: Finding): string {
  const data = (value: string) =>
    value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
  const property = (value: string) => data(value).replaceAll(':', '%3A').replaceAll(',', '%2C');
  const properties = ['title=Secret scan'];
  let where = `message of ${finding.commit}`;
  if (finding.kind === 'file') {
    properties.unshift(`file=${property(finding.path)}`);
    if (finding.line !== undefined) properties.splice(1, 0, `line=${finding.line}`);
    where = `commit ${finding.commit}`;
  }
  return `::error ${properties.join(',')}::${data(`${finding.rule} in ${where}`)}`;
}

if (import.meta.main) {
  const findings = scanCommits(process.argv[2] || undefined, process.argv[3] || undefined);
  for (const finding of findings) {
    const where =
      finding.kind === 'message'
        ? `message:${finding.line}`
        : finding.line === undefined
          ? finding.path
          : `${finding.path}:${finding.line}`;
    const commit = finding.commit.slice(0, 12);
    console.error(`error  ${where}  ${finding.rule}  ${finding.excerpt}  (commit ${commit})`);
    if (process.env.GITHUB_ACTIONS) console.error(annotation(finding));
  }
  if (findings.length > 0) {
    console.error(
      `${findings.length} possible secret(s). If one is real, treat it as leaked: rotate it, ` +
        'then rewrite the commits that contain it. For a deliberate test value, add ' +
        '"secret-scan: allow" to the line.',
    );
    process.exit(1);
  }
  console.log('No secrets found.');
}
