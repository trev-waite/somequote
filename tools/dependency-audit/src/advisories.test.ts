import { describe, expect, it } from 'vitest';
import { type Advisory, fixableAdvisories, parseAuditReport } from './advisories';

const entry = (id: number, title = `Advisory ${id}`) => ({
  id,
  url: `https://github.com/advisories/GHSA-${id}`,
  title,
  severity: 'high',
  vulnerable_versions: '<2.0.0',
  cwe: ['CWE-1321'],
});

const advisory = (name: string, id: number): Advisory => ({
  package: name,
  id,
  severity: 'high',
  title: `Advisory ${id}`,
  url: `https://github.com/advisories/GHSA-${id}`,
});

describe('parseAuditReport', () => {
  it('reads no advisories from an empty report', () => {
    expect(parseAuditReport('{}')).toEqual([]);
  });

  it('flattens advisories per package', () => {
    const report = JSON.stringify({ lodash: [entry(1), entry(2)], qs: [entry(3)] });

    expect(parseAuditReport(report)).toEqual([
      advisory('lodash', 1),
      advisory('lodash', 2),
      advisory('qs', 3),
    ]);
  });

  it.each([
    ['output that is not JSON', 'error: could not reach the registry'],
    ['a report that is not an object', '[]'],
    ['advisories that are not a list', '{"lodash": {}}'],
    ['an advisory without an id', '{"lodash": [{"title": "t", "severity": "low", "url": "u"}]}'],
  ])('rejects %s', (_, output) => {
    expect(() => parseAuditReport(output)).toThrow();
  });
});

describe('fixableAdvisories', () => {
  it('reports advisories that upgrading direct dependencies removes', () => {
    const current = [advisory('lodash', 1), advisory('follow-redirects', 2)];

    expect(fixableAdvisories(current, [])).toEqual(current);
  });

  it('leaves out advisories that remain after upgrading', () => {
    expect(fixableAdvisories([advisory('qs', 3)], [advisory('qs', 3)])).toEqual([]);
  });

  it('matches by package and advisory, so one fixed copy is still reported', () => {
    const current = [advisory('qs', 3), advisory('qs', 4)];

    expect(fixableAdvisories(current, [advisory('qs', 4)])).toEqual([advisory('qs', 3)]);
  });

  it('ignores advisories that only the upgraded dependencies introduce', () => {
    expect(fixableAdvisories([], [advisory('axios', 5)])).toEqual([]);
  });
});
