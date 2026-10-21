import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const client = fileURLToPath(new URL('../dist/client/', import.meta.url));
const theme = readFileSync(`${client}color-scheme.js`, 'utf8');
if (/<\/script/i.test(theme)) throw new Error('Theme script must not contain a closing script tag');
const source = readFileSync(`${client}index.html`, 'utf8');
const themeTag = '<script src="/color-scheme.js"></script>';
if (!source.includes(themeTag)) throw new Error('Missing theme script in built HTML');

const hashes: string[] = [];
const html = source
  .replace(themeTag, `<script>${theme}</script>`)
  .replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/g, (_tag, attributes: string, inline: string) => {
    const src = /\bsrc="([^"]+)"/.exec(attributes)?.[1];
    if (src && !/^\/assets\/[\w-]+\.js$/.test(src)) {
      throw new Error(`Unexpected script source: ${src}`);
    }
    const bytes = src ? readFileSync(`${client}${src.slice(1)}`) : inline;
    const hash = `sha384-${createHash('sha384').update(bytes).digest('base64')}`;
    hashes.push(`'${hash}'`);
    return `<script${attributes}${src ? ` integrity="${hash}"` : ''}>${inline}</script>`;
  });
if (hashes.length !== 2) throw new Error('Expected the theme bootstrap and app entry scripts');

const headers = readFileSync(`${client}_headers`, 'utf8');
const policy = "script-src 'self'";
if (!headers.includes(policy)) throw new Error('Missing script policy in built headers');
writeFileSync(`${client}index.html`, html);
writeFileSync(
  `${client}_headers`,
  headers.replace(policy, `script-src 'self' ${hashes.join(' ')}`),
);
