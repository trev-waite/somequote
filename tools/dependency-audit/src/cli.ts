import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { type Advisory, fixableAdvisories, parseAuditReport } from './advisories';

function run(command: string, args: readonly string[], cwd: string, okStatuses = [0]): string {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 ** 2 });
  if (result.error) throw result.error;
  if (result.status === null || !okStatuses.includes(result.status)) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${result.stderr}`);
  }
  return result.stdout;
}

/** `bun audit` exits 1 whenever it finds a vulnerability. */
const audit = (cwd: string) => parseAuditReport(run('bun', ['audit', '--json'], cwd, [0, 1]));

/** Compares the lockfile's audit with one in which every direct dependency is at its latest. */
export function auditDependencies(root = process.cwd()): {
  fixable: Advisory[];
  unfixable: Advisory[];
} {
  const current = audit(root);
  if (current.length === 0) return { fixable: [], unfixable: [] };

  const scratch = mkdtempSync(join(tmpdir(), 'dependency-audit-'));
  try {
    const manifests = run(
      'git',
      ['ls-files', '-z', '--', 'bun.lock', ':(glob)**/package.json'],
      root,
    )
      .split('\0')
      .filter(Boolean);
    for (const file of manifests) {
      mkdirSync(dirname(join(scratch, file)), { recursive: true });
      cpSync(join(root, file), join(scratch, file));
    }
    run('bun', ['update', '--latest', '--recursive', '--lockfile-only'], scratch);
    const fixable = fixableAdvisories(current, audit(scratch));
    return { fixable, unfixable: current.filter((advisory) => !fixable.includes(advisory)) };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const annotationData = (value: string) =>
  value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
const describe = ({ package: name, severity, title, url }: Advisory) =>
  annotationData(`${name}: ${severity} ${title} ${url}`);

if (import.meta.main) {
  const { fixable, unfixable } = auditDependencies();
  for (const advisory of unfixable) {
    console.log(`::notice title=No fix without an override::${describe(advisory)}`);
  }
  for (const advisory of fixable) {
    console.log(`::error title=Fixable vulnerability::${describe(advisory)}`);
  }
  if (fixable.length > 0) {
    console.log(
      'Run `bun audit fix --latest`. For a package it reports as blocked, upgrade the direct dependency `bun why <package>` names.',
    );
    process.exit(1);
  }
  console.log(
    `No vulnerability is fixable by upgrading a direct dependency (${unfixable.length} without a fix).`,
  );
}
