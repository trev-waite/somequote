/** Needs a zone token with Zone Read, Zone Settings, Zone WAF, Single Redirect, and DNS edit. */

const ZONE = 'somequote.com';
const API = 'https://api.cloudflare.com/client/v4';

const SETTINGS: Record<string, unknown> = {
  always_use_https: 'on',
  automatic_https_rewrites: 'on',
  min_tls_version: '1.2',
  tls_1_3: 'on',
  // 0-RTT early data can be replayed; the gain is a single round trip on resumed connections.
  '0rtt': 'off',
  http3: 'on',
  browser_check: 'on',
  // Both rewrite HTML and inject scripts that the page's Content-Security-Policy would block.
  email_obfuscation: 'off',
  rocket_loader: 'off',
  // HSTS is sent by the app (public/_headers and src/worker/app.ts). The zone header stays off so
  // responses never carry two conflicting Strict-Transport-Security headers.
  // Disabled with every field cleared, matching Cloudflare's documented "off" state.
  security_header: {
    strict_transport_security: {
      enabled: false,
      max_age: 0,
      include_subdomains: false,
      preload: false,
      nosniff: false,
    },
  },
};

interface Rule {
  readonly ref: string;
  readonly description: string;
  readonly expression: string;
  readonly action: string;
  readonly enabled: true;
  readonly [field: string]: unknown;
}

/** One rule per phase, owned by this script. The Free plan allows one rate limiting rule. */
const RULES: Record<string, Rule> = {
  http_ratelimit: {
    ref: 'somequote_api_burst',
    description: 'Block API bursts before they invoke the Worker',
    expression: 'starts_with(http.request.uri.path, "/api/")',
    action: 'block',
    enabled: true,
    ratelimit: {
      characteristics: ['ip.src', 'cf.colo.id'],
      period: 10,
      requests_per_period: 10,
      mitigation_timeout: 10,
    },
  },
  http_request_dynamic_redirect: {
    ref: 'somequote_www_to_apex',
    description: `Redirect www.${ZONE} to ${ZONE}`,
    expression: `http.host eq "www.${ZONE}"`,
    action: 'redirect',
    enabled: true,
    action_parameters: {
      from_value: {
        target_url: { expression: `concat("https://${ZONE}", http.request.uri.path)` },
        status_code: 301,
        preserve_query_string: true,
      },
    },
  },
};

/** The www redirect runs at the edge, so www only needs a proxied placeholder record. */
const WWW_RECORD = {
  type: 'AAAA',
  name: `www.${ZONE}`,
  content: '100::',
  proxied: true,
  ttl: 1,
  comment: 'Originless; redirected to the apex by a redirect rule (scripts/configure-zone.ts)',
};

const apply = process.argv.includes('--apply');
const check = process.argv.includes('--check');
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) {
  console.error('Set CLOUDFLARE_API_TOKEN (see the header of this script for permissions).');
  process.exit(1);
}

class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const envelope = (await response.json()) as {
    success: boolean;
    errors?: { code: number; message: string }[];
    result: T;
  };
  if (!response.ok || !envelope.success) {
    const errors = envelope.errors?.map((e) => `${e.code}: ${e.message}`).join('; ');
    throw new ApiError(response.status, `${method} ${path} failed (${response.status}): ${errors}`);
  }
  return envelope.result;
}

function includes(actual: unknown, desired: unknown): boolean {
  if (typeof desired !== 'object' || desired === null) return actual === desired;
  if (typeof actual !== 'object' || actual === null) return false;
  if (Array.isArray(desired)) {
    return (
      Array.isArray(actual) &&
      actual.length === desired.length &&
      desired.every((item) => actual.some((candidate) => includes(candidate, item)))
    );
  }
  return Object.entries(desired).every(([key, value]) =>
    includes((actual as Record<string, unknown>)[key], value),
  );
}

interface Change {
  readonly summary: string;
  readonly run: () => Promise<unknown>;
}

const changes: Change[] = [];
const problems: string[] = [];
const notes: string[] = [];

const zones = await api<{ id: string; name: string; plan: { name: string } }[]>(
  'GET',
  `/zones?name=${ZONE}`,
);
const zone = zones[0];
if (!zone) {
  console.error(`Zone ${ZONE} is not in this account, or the token cannot read it.`);
  process.exit(1);
}
const zonePath = `/zones/${zone.id}`;
console.log(`${ZONE} (${zone.plan.name})`);

const ssl = await api<{ value: string }>('GET', `${zonePath}/settings/ssl`);
if (ssl.value === 'off') {
  problems.push('SSL/TLS encryption is off; Always Use HTTPS requires it. Enable it first.');
}

for (const [id, value] of Object.entries(SETTINGS)) {
  const current = await api<{ value: unknown }>('GET', `${zonePath}/settings/${id}`);
  if (!includes(current.value, value)) {
    changes.push({
      summary: `setting ${id}: ${JSON.stringify(current.value)} → ${JSON.stringify(value)}`,
      run: () => api('PATCH', `${zonePath}/settings/${id}`, { value }),
    });
  }
}

for (const [phase, rule] of Object.entries(RULES)) {
  let ruleset: { id: string; rules?: ({ id: string } & Partial<Rule>)[] } | undefined;
  try {
    ruleset = await api('GET', `${zonePath}/rulesets/phases/${phase}/entrypoint`);
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) throw error;
  }
  const existing = ruleset?.rules?.find((candidate) => candidate.ref === rule.ref);
  const others = ruleset?.rules?.filter((candidate) => candidate.ref !== rule.ref) ?? [];
  if (phase === 'http_ratelimit' && others.length > 0) {
    const names = others.map((other) => other.description ?? other.id).join(', ');
    problems.push(
      `${phase} already has rules not managed by this script (${names}). The Free plan allows ` +
        'one rate limiting rule; delete them in Security → Security rules, then re-run.',
    );
  }
  if (!ruleset) {
    changes.push({
      summary: `${phase}: create ruleset with ${rule.ref}`,
      run: () =>
        api('POST', `${zonePath}/rulesets`, {
          name: `default ${phase}`,
          kind: 'zone',
          phase,
          rules: [rule],
        }),
    });
  } else if (!existing) {
    const { id } = ruleset;
    changes.push({
      summary: `${phase}: add ${rule.ref}`,
      run: () => api('POST', `${zonePath}/rulesets/${id}/rules`, rule),
    });
  } else if (!includes(existing, rule)) {
    const { id } = ruleset;
    changes.push({
      summary: `${phase}: update ${rule.ref}`,
      run: () => api('PATCH', `${zonePath}/rulesets/${id}/rules/${existing.id}`, rule),
    });
  }
}

const wwwRecords = await api<{ type: string; proxied: boolean }[]>(
  'GET',
  `${zonePath}/dns_records?name=${WWW_RECORD.name}`,
);
if (wwwRecords.length === 0) {
  changes.push({
    summary: `dns: add proxied ${WWW_RECORD.type} ${WWW_RECORD.name} → ${WWW_RECORD.content}`,
    run: () => api('POST', `${zonePath}/dns_records`, WWW_RECORD),
  });
} else if (!wwwRecords.every((record) => record.proxied)) {
  problems.push(
    `${WWW_RECORD.name} has a DNS-only record, so the www redirect rule would never run. ` +
      'Proxy it (orange cloud) or delete it so this script can add a placeholder, then re-run.',
  );
}

const dnssec = await api<{ status: string; ds?: string }>('GET', `${zonePath}/dnssec`);
if (dnssec.status === 'disabled') {
  changes.push({
    summary: 'dnssec: enable',
    run: async () => {
      const enabled = await api<{ ds?: string }>('PATCH', `${zonePath}/dnssec`, {
        status: 'active',
      });
      notes.push(
        'Add this DS record at your registrar (automatic with Cloudflare Registrar): ' +
          (enabled.ds ?? '(see Cloudflare dashboard → DNS → Settings)'),
      );
    },
  });
} else if (dnssec.status === 'pending') {
  notes.push(`DNSSEC is pending; add this DS record at your registrar: ${dnssec.ds ?? ''}`);
}

for (const problem of problems) console.error(`error  ${problem}`);
for (const { summary } of changes)
  console.log(`${apply && problems.length === 0 ? 'apply' : 'plan '}  ${summary}`);
if (problems.length > 0) {
  console.error(`${problems.length} problem(s); nothing was changed.`);
  process.exit(1);
}
if (apply) {
  for (const { run } of changes) await run();
}
for (const note of notes) console.log(`note   ${note}`);

if (changes.length === 0) console.log('Zone already matches.');
else if (apply) console.log(`${changes.length} change(s) applied.`);
else if (check) {
  console.error(`The zone has drifted: ${changes.length} setting(s) differ from this script.`);
  process.exit(1);
} else console.log(`${changes.length} change(s) planned. Re-run with --apply to make them.`);
