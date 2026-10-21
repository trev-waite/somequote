interface Rule {
  readonly id: string;
  readonly pattern: RegExp;
  readonly accept?: (value: string) => boolean;
}

const NAME = String.raw`[\w.-]{0,80}?(?:token|secret|password|passwd|api[_-]?key|private[_-]?key)`;

/**
 * A credential-looking value assigned to a secret-looking name, such as
 * `CLOUDFLARE_API_TOKEN=…`, `apiKey: "…"`, or `{"password":"…"}`. This is how unprefixed
 * (pre-2026) Cloudflare tokens are caught; without a name beside them they are indistinguishable
 * from any random string. The name is bounded and must start at a boundary, so matching stays
 * linear on long minified lines.
 */
const ASSIGNMENT = new RegExp(
  String.raw`(?<![\w.-])${NAME}\b["']?\s*[:=]\s*(?:"((?:[^"\\\n]|\\.){8,512})"|'((?:[^'\\\n]|\\.){8,512})'|` +
    String.raw`\x60([^\x60\\\n]{8,512})\x60|([\w+/=.~-]{20,512}))`,
  'gi',
);

const DANGLING_NAME = new RegExp(
  String.raw`(?<![\w.-])(${NAME})\b["']?\s*[:=]\s*(?:[|>][+-]?\d*|\\)\s*$`,
  'i',
);

const PLACEHOLDER =
  /^(?:your[-_ ]|<|placeholder|changeme|change[-_]me|dummy|fake[-_]|redacted|example|test[-_]|x{4,}|\.{3,}|\*{3,})|^[x.*-]+$/i;

const REFERENCE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/;

function isCredentialValue(value: string): boolean {
  return (
    /[A-Za-z]/.test(value) &&
    /\d/.test(value) &&
    !/[${}<>]/.test(value) &&
    !PLACEHOLDER.test(value) &&
    !REFERENCE.test(value)
  );
}

const RULES: readonly Rule[] = [
  // Cloudflare's scannable formats (2026): cfut_ user, cfat_ account, cfk_ global key, cfast_
  // Access service secret; each is 40 characters plus a checksum.
  { id: 'cloudflare-credential', pattern: /\bcf(?:ut|at|k|ast)_[A-Za-z0-9]{40,64}/g },
  // Pre-2026 Global API Keys are 37–45 lowercase hex characters, recognizable only by the header.
  {
    id: 'cloudflare-global-key',
    pattern: /\bx-auth-key\b["']?\s*[:=]\s*["']?([a-f0-9]{37,45})\b/gi,
  },
  { id: 'cloudflare-origin-ca-key', pattern: /\bv1\.0-[0-9a-f]{24}-[0-9a-f]{146}\b/g },
  { id: 'github-token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_\w{60,255})/g },
  { id: 'anthropic-api-key', pattern: /\bsk-ant-[\w-]{32,255}/g },
  { id: 'openai-api-key', pattern: /\bsk-(?!ant-)(?:proj-|svcacct-|admin-)?[\w-]{32,255}/g },
  { id: 'xai-api-key', pattern: /\bxai-[A-Za-z0-9]{32,255}/g },
  { id: 'google-api-key', pattern: /\bAIza[\w-]{35}/g },
  {
    id: 'aws-access-key-id',
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    accept: (value) => !value.endsWith('EXAMPLE'),
  },
  { id: 'npm-token', pattern: /\bnpm_[A-Za-z0-9]{36}/g },
  {
    id: 'private-key',
    pattern: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY(?: BLOCK)?-----|PuTTY-User-Key-File-[23]:/g,
  },
  { id: 'jwt', pattern: /\beyJ[\w-]{10,4096}\.eyJ[\w-]{10,4096}\.[\w-]{10,4096}/g },
  {
    id: 'bearer-token',
    pattern: /\bBearer\s{1,8}([\w./+=-]{20,4096})/gi,
    accept: isCredentialValue,
  },
  {
    id: 'url-credentials',
    pattern: /\b[a-z][a-z0-9+.-]{0,30}:\/\/[^/\s:@]{1,256}:([^/\s:@]{8,256})@/gi,
    accept: isCredentialValue,
  },
];

const PRIVATE_FILES = [
  /(?:^|\/)\.env(?:\.[^/]+)?$/,
  /(?:^|\/)\.envrc$/,
  /(?:^|\/)\.dev\.vars(?:\.[^/]+)?$/,
  /\.(?:pem|key|p12|pfx|ppk)$/i,
  /(?:^|\/)id_(?:rsa|ecdsa|ed25519)(?:_sk)?$/,
];
const TEMPLATE_FILE = /\.(?:example|sample|template)$/;

const ALLOW_MARKER = 'secret-scan: allow';

interface Detection {
  readonly rule: string;
  /** The secret itself, for de-duplication. Never printed. */
  readonly value: string;
}

export type Finding =
  | {
      readonly kind: 'file';
      readonly commit: string;
      readonly path: string;
      readonly line?: number;
      readonly rule: string;
      readonly excerpt: string;
    }
  | {
      readonly kind: 'message';
      readonly commit: string;
      readonly line: number;
      readonly rule: string;
      readonly excerpt: string;
    };

export function redact(value: string): string {
  const prefix = /^[a-z]{2,6}[_-](?:[a-z]{2,6}[_-])?/i.exec(value)?.[0];
  return `${prefix ?? value.slice(0, 3)}…`;
}

export function findSecrets(text: string): Detection[] {
  if (text.includes(ALLOW_MARKER)) return [];
  const found: Detection[] = [];
  const overlaps = (value: string) =>
    found.some((f) => f.value.includes(value) || value.includes(f.value));
  for (const { id, pattern, accept } of RULES) {
    for (const match of text.matchAll(pattern)) {
      const value = match[1] ?? match[0];
      if ((!accept || accept(value)) && !overlaps(value)) found.push({ rule: id, value });
    }
  }
  for (const match of text.matchAll(ASSIGNMENT)) {
    const [, double, single, backtick, bare] = match;
    const value = double ?? single ?? backtick ?? bare ?? '';
    // An unquoted identifier is usually code (`apiKey: CloudflareApiTokenV2`), not a token.
    const identifier = bare !== undefined && /^[A-Za-z_]\w*$/.test(value);
    const credentialShaped = !identifier || value.length >= 32 || /\d.*\d/.test(value);
    if (isCredentialValue(value) && credentialShaped && !overlaps(value)) {
      found.push({ rule: 'secret-assignment', value });
    }
  }
  return found;
}

function danglingName(text: string): string | undefined {
  return text.includes(ALLOW_MARKER) ? undefined : DANGLING_NAME.exec(text)?.[1];
}

function continuedValue(text: string): string {
  return text
    .trim()
    .replace(/[\\,]$/, '')
    .trim()
    .replace(/^(["'])(.*)\1$/, '$2');
}

export function isPrivateFile(path: string): boolean {
  return !TEMPLATE_FILE.test(path) && PRIVATE_FILES.some((pattern) => pattern.test(path));
}

const ESCAPES: Record<string, string> = {
  a: '\x07',
  b: '\b',
  t: '\t',
  n: '\n',
  v: '\v',
  f: '\f',
  r: '\r',
};

function headerPath(header: string): string | undefined {
  const sides = header.slice('diff --git '.length);
  const quoted = /^"(?:[^"\\]|\\.)*" "((?:[^"\\]|\\.)*)"$/.exec(sides)?.[1];
  if (quoted !== undefined) {
    const path = quoted.replace(/\\([0-7]{3}|.)/g, (_, code: string) =>
      code.length === 3 ? String.fromCharCode(Number.parseInt(code, 8)) : (ESCAPES[code] ?? code),
    );
    return path.startsWith('b/') ? path.slice(2) : undefined;
  }
  // With --no-renames both sides name the same file: "a/<path> b/<path>".
  if (!sides.startsWith('a/')) return undefined;
  return sides.slice(2, 2 + (sides.length - 'a/'.length - ' b/'.length) / 2);
}

export function scanLog(log: string): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  let commit = '';
  let path: string | undefined;
  let inHunk = false;
  let line = 0;
  let pending: { readonly name: string; readonly line: number } | undefined;

  const report = (finding: Finding, value: string) => {
    const key = `${finding.kind === 'file' ? finding.path : ''}\0${finding.rule}\0${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(finding);
  };

  for (const text of log.split('\n')) {
    if (text.startsWith('commit ')) {
      commit = text.slice('commit '.length);
      path = undefined;
      inHunk = false;
    } else if (text.startsWith('diff --git ')) {
      path = headerPath(text);
      inHunk = false;
      pending = undefined;
    } else if (!inHunk && path && text.startsWith('new file mode') && isPrivateFile(path)) {
      // Checked here rather than on "+++", which binary files (such as .p12) don't have.
      report({ kind: 'file', commit, path, rule: 'private-file', excerpt: path }, path);
    } else if (text.startsWith('@@ ')) {
      inHunk = true;
      line = Number(/\+(\d+)/.exec(text)?.[1] ?? 0);
      pending = undefined;
    } else if (inHunk && path && text.startsWith('+')) {
      const content = text.slice(1).replace(/\r$/, '');
      const detections = findSecrets(content);
      if (pending?.line === line - 1) {
        detections.push(
          ...findSecrets(`${pending.name}=${JSON.stringify(continuedValue(content))}`),
        );
      }
      for (const { rule, value } of detections) {
        report({ kind: 'file', commit, path, line, rule, excerpt: redact(value) }, value);
      }
      const name = danglingName(content);
      pending = name ? { name, line } : undefined;
      line++;
    } else if (inHunk && text.startsWith(' ')) {
      // Context: a changed value under an unchanged `name: |` is still assigned to that name.
      const name = danglingName(text.slice(1).replace(/\r$/, ''));
      pending = name ? { name, line } : undefined;
      line++;
    }
  }
  return findings;
}

export function scanMessage(commit: string, message: string): Finding[] {
  return message.split('\n').flatMap((text, index) =>
    findSecrets(text).map(({ rule, value }) => ({
      kind: 'message' as const,
      commit,
      line: index + 1,
      rule,
      excerpt: redact(value),
    })),
  );
}
