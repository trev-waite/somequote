export interface Advisory {
  readonly package: string;
  readonly id: number;
  readonly severity: string;
  readonly title: string;
  readonly url: string;
}

export function parseAuditReport(output: string): Advisory[] {
  let report: unknown;
  try {
    report = JSON.parse(output);
  } catch {
    throw new Error(`bun audit did not print JSON:\n${output}`);
  }
  if (typeof report !== 'object' || report === null || Array.isArray(report)) {
    throw new Error(`bun audit printed an unexpected report:\n${output}`);
  }
  return Object.entries(report).flatMap(([name, advisories]) => {
    if (!Array.isArray(advisories) || !advisories.every(isAdvisoryEntry)) {
      throw new Error(`bun audit printed unexpected advisories for ${name}`);
    }
    return advisories.map(({ id, severity, title, url }) => ({
      package: name,
      id,
      severity,
      title,
      url,
    }));
  });
}

export interface Triage {
  readonly fixable: Advisory[];
  readonly criticalWithoutFix: Advisory[];
  readonly withoutFix: Advisory[];
}

export function triage(current: readonly Advisory[], upgraded: readonly Advisory[]): Triage {
  const remaining = new Set(upgraded.map(key));
  const unfixed = current.filter((advisory) => remaining.has(key(advisory)));
  return {
    fixable: current.filter((advisory) => !remaining.has(key(advisory))),
    criticalWithoutFix: unfixed.filter((advisory) => advisory.severity === 'critical'),
    withoutFix: unfixed.filter((advisory) => advisory.severity !== 'critical'),
  };
}

const key = (advisory: Advisory) => `${advisory.package}\0${advisory.id}`;

function isAdvisoryEntry(value: unknown): value is Omit<Advisory, 'package'> {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'number' &&
    typeof entry.severity === 'string' &&
    typeof entry.title === 'string' &&
    typeof entry.url === 'string'
  );
}
