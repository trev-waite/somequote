import { attributionUrl } from '../src/attributions';
import { COLLECTION } from '../src/collection';

const urls = new Set<string>();
const problems: string[] = [];
for (const { quote } of COLLECTION) {
  const url = attributionUrl(quote);
  if (url) urls.add(url);
  else problems.push(`${quote.id}: missing Grokipedia attribution link`);
}

const pending = [...urls];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let url = pending.pop(); url; url = pending.pop()) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (new URL(response.url).origin !== 'https://grokipedia.com') {
          throw new Error(`redirected outside Grokipedia to ${response.url}`);
        }
        const html = await response.text();
        const title = /<title>(.*?)<\/title>/s.exec(html)?.[1];
        if (!title?.endsWith(' — Grokipedia') || title === 'Article Not Found — Grokipedia') {
          throw new Error(`expected a Grokipedia article, received ${JSON.stringify(title)}`);
        }
        console.log(`${url}: ${title}`);
      } catch (error) {
        problems.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }),
);

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Verified ${urls.size} Grokipedia links covering all ${COLLECTION.length} quotes.`);
}
