/**
 * Checks a deployed site: the page, its module bundle, and today's quote all load with the
 * production headers. Retries for a short while so a just-finished deploy can propagate.
 *
 * Usage: bun scripts/smoke.ts https://somequote.com   (or http://127.0.0.1:4173 for a local preview)
 */
import { PublicationDto } from '../src/shared/api-contract';

const ATTEMPTS = 6;
const RETRY_MS = 5000;
const HSTS = 'max-age=63072000; includeSubDomains';

const origin = process.argv[2] ?? '';
if (!/^https:\/\/|^http:\/\/(?:127\.0\.0\.1|localhost)[:/]/.test(origin)) {
  console.error('Usage: bun scripts/smoke.ts https://<host>');
  process.exit(1);
}

async function get(path: string): Promise<Response> {
  const response = await fetch(new URL(path, origin), {
    headers: { 'User-Agent': 'SomeQuote deploy smoke test' },
    redirect: 'manual',
  });
  if (response.status !== 200) throw new Error(`${path}: HTTP ${response.status}`);
  if (response.headers.get('Strict-Transport-Security') !== HSTS) {
    throw new Error(`${path}: Strict-Transport-Security is not ${HSTS}`);
  }
  return response;
}

async function check(): Promise<string> {
  const page = await get('/');
  const html = await page.text();
  const policy = page.headers.get('Content-Security-Policy') ?? '';
  if (!policy.includes("script-src 'self' 'sha384-")) {
    throw new Error('/: missing Content-Security-Policy');
  }
  const bundle = /<script type="module"[^>]* src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
  if (!bundle) throw new Error('/: no module bundle in the page');
  await (await get(bundle)).arrayBuffer();

  const today = PublicationDto.safeParse(await (await get('/api/quote/today')).json());
  if (!today.success) throw new Error('/api/quote/today: response does not match the contract');
  return `${today.data.date} ${today.data.quote.id}`;
}

for (let attempt = 1; ; attempt++) {
  try {
    console.log(`${origin} is healthy: ${await check()}`);
    break;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (attempt === ATTEMPTS) {
      console.error(`${origin} failed its smoke test: ${reason}`);
      process.exit(1);
    }
    console.warn(`attempt ${attempt}/${ATTEMPTS}: ${reason}; retrying`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
  }
}
