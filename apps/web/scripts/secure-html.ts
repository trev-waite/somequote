import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const client = fileURLToPath(new URL('../dist/client/', import.meta.url));
const BOOTSTRAP_SCRIPTS = ['color-scheme.js', 'request-today.js'];

let source = readFileSync(`${client}index.html`, 'utf8');
for (const name of BOOTSTRAP_SCRIPTS) {
  const script = readFileSync(`${client}${name}`, 'utf8');
  if (/<\/script/i.test(script)) throw new Error(`${name} must not contain a closing script tag`);
  const tag = `<script src="/${name}"></script>`;
  if (!source.includes(tag)) throw new Error(`Missing ${name} in built HTML`);
  source = source.replace(tag, () => `<script>${script}</script>`);
}

const hashes: string[] = [];
const html = source.replace(
  /<script\b([^>]*)>([\s\S]*?)<\/script>/g,
  (_tag, attributes: string, inline: string) => {
    const src = /\bsrc="([^"]+)"/.exec(attributes)?.[1];
    if (src && !/^\/assets\/[\w-]+\.js$/.test(src)) {
      throw new Error(`Unexpected script source: ${src}`);
    }
    const bytes = src ? readFileSync(`${client}${src.slice(1)}`) : inline;
    const hash = `sha384-${createHash('sha384').update(bytes).digest('base64')}`;
    hashes.push(`'${hash}'`);
    return `<script${attributes}${src ? ` integrity="${hash}"` : ''}>${inline}</script>`;
  },
);
if (hashes.length !== BOOTSTRAP_SCRIPTS.length + 1) {
  throw new Error('Expected the bootstrap scripts and the app entry script');
}

const headers = readFileSync(`${client}_headers`, 'utf8');
const policy = "script-src 'self'";
if (!headers.includes(policy)) throw new Error('Missing script policy in built headers');
writeFileSync(`${client}index.html`, html);
writeFileSync(
  `${client}_headers`,
  headers.replace(policy, `script-src 'self' ${hashes.join(' ')}`),
);
