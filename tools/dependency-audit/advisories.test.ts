import { describe, expect, it } from 'vitest';
import { type Advisory, parseAuditReport, triage } from './advisories';

const entry = (id: number, title = `Advisory ${id}`) => ({
  id,
  url: `https://github.com/advisories/GHSA-${id}`,
  title,
  severity: 'high',
  vulnerable_versions: '<2.0.0',
  cwe: ['CWE-1321'],
});

const advisory = (name: string, id: number, severity = 'high'): Advisory => ({
  package: name,
  id,
  severity,
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

describe('triage', () => {
  it('reports advisories that upgrading direct dependencies removes as fixable', () => {
    const current = [advisory('lodash', 1), advisory('follow-redirects', 2, 'critical')];

    expect(triage(current, [])).toEqual({
      fixable: current,
      criticalWithoutFix: [],
      withoutFix: [],
    });
  });

  it('separates critical advisories that remain after upgrading from the rest', () => {
    const current = [advisory('qs', 3, 'moderate'), advisory('form-data', 4, 'critical')];

    expect(triage(current, current)).toEqual({
      fixable: [],
      criticalWithoutFix: [advisory('form-data', 4, 'critical')],
      withoutFix: [advisory('qs', 3, 'moderate')],
    });
  });

  it('matches by package and advisory, so one fixed copy is still reported', () => {
    const current = [advisory('qs', 3), advisory('qs', 4)];

    expect(triage(current, [advisory('qs', 4)])).toEqual({
      fixable: [advisory('qs', 3)],
      criticalWithoutFix: [],
      withoutFix: [advisory('qs', 4)],
    });
  });

  it('ignores advisories that only the upgraded dependencies introduce', () => {
    expect(triage([], [advisory('axios', 5, 'critical')])).toEqual({
      fixable: [],
      criticalWithoutFix: [],
      withoutFix: [],
    });
  });
});
