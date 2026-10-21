import { describe, expect, it } from 'vitest';
import { findSecrets, isPrivateFile, redact } from './secrets';

/**
 * Fake credentials are assembled at runtime, often split around `${…}`, so that this file never
 * contains one and the scanner can run over its own history.
 */
const random = (length: number) =>
  Array.from({ length }, (_, index) => 'aZ3kQ9mW7xP2'[index % 12]).join('');
const hex = (length: number) => '3f9a0c7e1b5d'.repeat(4).slice(0, length);
const fakes = {
  cloudflareAccount: `cfat_${random(40)}0a1b2c3d`,
  cloudflareUser: `cfut_${random(40)}9f8e7d6c`,
  cloudflareGlobal: `cfk_${random(40)}12345678`,
  cloudflareAccess: `cfast_${random(40)}abcdef12`,
  github: `ghp_${random(36)}`,
  githubFineGrained: `github_pat_${random(82)}`,
  anthropic: `sk-ant-api03-${random(80)}`,
  openai: `sk-proj-${random(48)}`,
  aws: `AKIA${'ABCDEFGH23456789'}`,
  pem: ['-----BEGIN', 'OPENSSH', 'PRIVATE', 'KEY-----'].join(' '),
  pgp: ['-----BEGIN', 'PGP', 'PRIVATE', 'KEY', 'BLOCK-----'].join(' '),
  putty: ['PuTTY-User-Key-File-3', ': ssh-ed25519'].join(''),
};
const rulesIn = (text: string) => findSecrets(text).map(({ rule }) => rule);

describe('findSecrets', () => {
  it.each([
    ['a Cloudflare account token with no name beside it', `cf = "${fakes.cloudflareAccount}"`],
    ['a Cloudflare user token in YAML', `token: ${fakes.cloudflareUser}`],
    ['a Cloudflare global key', fakes.cloudflareGlobal],
    ['a Cloudflare Access service secret', `CF-Access-Client-Secret: ${fakes.cloudflareAccess}`],
    ['a prefixed token after Bearer', `Authorization: Bearer ${fakes.cloudflareAccount}`],
  ])('finds %s once', (_, line) => {
    expect(rulesIn(line)).toEqual(['cloudflare-credential']);
  });

  it.each([
    ['github-token', `GH=${fakes.github}`],
    ['github-token', fakes.githubFineGrained],
    ['anthropic-api-key', `client = new Anthropic('${fakes.anthropic}')`],
    ['openai-api-key', fakes.openai],
    ['aws-access-key-id', `aws_access_key_id = ${fakes.aws}`],
    ['private-key', fakes.pem],
    ['private-key', fakes.pgp],
    ['private-key', fakes.putty],
    ['cloudflare-global-key', `X-Auth-Key: ${hex(37)}`],
    ['cloudflare-global-key', `curl -H "x-auth-key: ${hex(45)}" https://api.cloudflare.com`],
    ['bearer-token', `curl -H "Authorization: Bearer ${random(40)}"`],
    ['url-credentials', `DATABASE_URL=postgres://app:${'s3cr3t'}Value99@db.internal:5432/app`],
  ])('finds %s', (rule, line) => {
    expect(rulesIn(line)).toContain(rule);
  });

  it('reports every token on a line', () => {
    expect(rulesIn(`${fakes.cloudflareAccount} ${fakes.cloudflareUser}`)).toHaveLength(2);
  });

  it('finds an unprefixed legacy token only when a secret-looking name is assigned it', () => {
    const legacy = random(40);
    expect(rulesIn(`CLOUDFLARE_API_TOKEN=${legacy}`)).toEqual(['secret-assignment']);
    expect(rulesIn(`export const apiKey = "${legacy}";`)).toEqual(['secret-assignment']);
    expect(rulesIn(`const digest = "${legacy}";`)).toEqual([]);
  });

  it.each([
    ['a quoted passphrase with spaces', `password = "${'correct horse'} battery staple 99"`],
    ['an escaped quote in JSON', `{"password":"${'ab'}\\"cd1234567890xyz"}`],
    [
      'a value that merely contains a placeholder word',
      `api_key = "${'prod'}-example-token-1234567890"`,
    ],
  ])('finds %s', (_, line) => {
    expect(rulesIn(line)).toEqual(['secret-assignment']);
  });

  it.each([
    `CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_DEPLOY_TOKEN }}`,
    `GH_TOKEN: \${{ github.token }}`,
    'CLOUDFLARE_API_TOKEN=… bun run --cwd apps/web zone:plan',
    'CLOUDFLARE_API_TOKEN=$TOKEN bun scripts/configure-zone.ts',
    'api_key = "your-api-key-goes-here-1234"',
    'const tokens = useMemo(() => tokenize(displayText), [displayText]);',
    'password: process.env.DATABASE_PASSWORD_2024',
    'apiKey: CloudflareAccountApiTokenV2',
    'GITLEAKS_SHA256: 551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
    `X-Auth-Key: \${CF_API_KEY}`,
    `Authorization: Bearer \${TOKEN}`,
    `Authorization: Bearer \${{ secrets.CLOUDFLARE_API_TOKEN }}`,
    `postgres://app:\${DB_PASSWORD}@db.internal/app`,
    'https://user:password@example.com',
    'AKIAIOSFODNN7EXAMPLE',
    ['-----BEGIN', 'PGP', 'PUBLIC', 'KEY', 'BLOCK-----'].join(' '),
    'PuTTY is an SSH client',
    '"integrity": "sha512-Zn0hKVFhMNGmE8zAWP/Y6ZK4BXcwr9F/5pZgxMCA1EmRGmSaUbbOrsWRbK1jMxrqGKSUJ5eBhIwdhkUtGQ1Ylw=="',
  ])('ignores %s', (line) => {
    expect(findSecrets(line)).toEqual([]);
  });

  it('skips a line marked as a deliberate test value', () => {
    expect(findSecrets(`${fakes.github} // secret-scan: allow`)).toEqual([]);
  });

  it.each([
    ['a long run of one character', 'a'.repeat(200_000)],
    ['secret-looking names with no values', 'token '.repeat(40_000)],
    ['an unterminated quoted value', `password = "${'a1'.repeat(100_000)}`],
    ['a long dotted identifier', `${'a.'.repeat(100_000)}token`],
    ...[
      'cfat_',
      'github_pat_',
      'sk-ant-',
      'sk-',
      'xai-',
      'eyJ',
      'Bearer ',
      'x://u:',
      'x-auth-key: ',
    ].map((prefix) => [
      `a repeated ${prefix.trim()} prefix`,
      prefix.repeat(200_000 / prefix.length),
    ]),
  ])('stays fast on %s', (_, line) => {
    const start = performance.now();
    findSecrets(line);
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe('redact', () => {
  it('keeps only the prefix that names the credential type, or three characters', () => {
    expect(redact(fakes.cloudflareAccount)).toBe('cfat_…');
    expect(redact(fakes.anthropic)).toBe('sk-ant-…');
    expect(redact(random(40))).toBe('aZ3…');
  });
});

describe('isPrivateFile', () => {
  it.each([
    '.env',
    '.env.production',
    '.envrc',
    'apps/web/.dev.vars',
    'certs/origin.pem',
    'store.p12',
    'keys/id.ppk',
    'id_ed25519',
    'id_ed25519_sk',
  ])('rejects %s', (path) => {
    expect(isPrivateFile(path)).toBe(true);
  });

  it.each([
    '.env.example',
    '.env.sample',
    'apps/web/.dev.vars.example',
    'id_ed25519.pub',
    'src/keyboard.ts',
    'env.ts',
  ])('allows %s', (path) => {
    expect(isPrivateFile(path)).toBe(false);
  });
});
