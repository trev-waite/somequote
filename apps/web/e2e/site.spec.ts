import { createHash } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { PublicationDto } from '../src/shared/api-contract';

// Each test is a separate visitor to the API's per-IP rate limit, as separate people would be.
// The local Worker takes the address from this header; in production Cloudflare sets it.
test.use({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures take their dependencies first
  extraHTTPHeaders: async ({}, use, testInfo) => {
    const hash = [...testInfo.testId].reduce((sum, c) => (sum * 31 + c.charCodeAt(0)) >>> 0, 7);
    await use({
      'CF-Connecting-IP': `10.${(hash >> 16) & 255}.${(hash >> 8) & 255}.${hash & 255}`,
    });
  },
});

function browserProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`exception: ${error.message}`));
  page.on('requestfailed', (request) =>
    problems.push(`request failed: ${request.url()} (${request.failure()?.errorText})`),
  );
  page.on('response', (response) => {
    if (response.status() >= 400) problems.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  return problems;
}

test('shows today’s quote under the production headers without browser errors', async ({
  page,
}) => {
  const problems = browserProblems(page);
  const api = await page.request.get('/api/quote/today');
  expect(api.status()).toBe(200);
  const { quote } = PublicationDto.parse(await api.json());

  const response = await page.goto('/');

  const headers = response?.headers() ?? {};
  expect(headers['content-security-policy']).toContain("script-src 'self' 'sha384-");
  expect(headers['strict-transport-security']).toBe('max-age=63072000; includeSubDomains');
  expect(headers['x-content-type-options']).toBe('nosniff');
  await expect(page.locator('blockquote .visually-hidden')).toHaveText(`“${quote.text}”`);
  await expect(page.locator('figcaption')).toContainText(
    quote.category === 'general' ? quote.author : quote.reference,
  );
  expect(await page.evaluate(() => document.fonts.check('400 1em "Instrument Serif"'))).toBe(true);
  expect(problems).toEqual([]);
});

test('authorizes the built scripts with matching hashes and integrity', async ({
  page,
  request,
}) => {
  const response = await page.goto('/');
  const policy = response?.headers()['content-security-policy'] ?? '';
  const scripts = await page.locator('script').evaluateAll((elements) =>
    elements.map((script) => ({
      src: script.getAttribute('src'),
      text: script.textContent ?? '',
      integrity: script.getAttribute('integrity'),
    })),
  );
  expect(scripts).toHaveLength(3);
  for (const script of scripts) {
    const content = script.src ? await (await request.get(script.src)).body() : script.text;
    const hash = `sha384-${createHash('sha384').update(content).digest('base64')}`;
    expect(policy).toContain(`'${hash}'`);
    if (script.src) expect(script.integrity).toBe(hash);
  }
});

test('blocks an injected inline script under the production policy', async ({ page }) => {
  await page.route('**/', async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    await route.fulfill({
      response,
      body: html.replace('<head>', '<head><script>window.untrustedScriptRan = true</script>'),
    });
  });
  await page.goto('/');
  await expect(page.locator('blockquote')).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, 'untrustedScriptRan'))).toBeUndefined();
});

test('runs the Cloudflare Web Analytics beacon the zone injects', async ({ page }) => {
  await page.route('https://static.cloudflareinsights.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: 'window.analyticsBeaconRan = true',
    }),
  );
  await page.route('**/', async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    await route.fulfill({
      response,
      body: html.replace(
        '</body>',
        '<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js/v1" crossorigin="anonymous"></script></body>',
      ),
    });
  });
  await page.goto('/');
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, 'analyticsBeaconRan')))
    .toBe(true);
});

test('rejects modified app bytes through Subresource Integrity', async ({ page }) => {
  const rejected = page.waitForEvent(
    'console',
    (message) => message.type() === 'error' && /integrity/i.test(message.text()),
  );
  await page.route('**/assets/index-*.js', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}\nwindow.modifiedBundleRan = true;`,
    });
  });
  await page.goto('/');
  await rejected;
  expect(await page.evaluate(() => Reflect.get(window, 'modifiedBundleRan'))).toBeUndefined();
  await expect(page.locator('blockquote')).toHaveCount(0);
});

test('shows the quote before requesting the desk and survives a failed desk download', async ({
  page,
}) => {
  let quoteMountedAtRequest = false;
  await page.route('**/assets/Desk-*.js', async (route) => {
    quoteMountedAtRequest = (await page.locator('blockquote').count()) === 1;
    await route.abort('failed');
  });
  await page.goto('/');
  await expect(page.locator('blockquote')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('The desk couldn’t be loaded.');
  expect(quoteMountedAtRequest).toBe(true);
  await expect(page.locator('blockquote')).toBeVisible();
  await page.unroute('**/assets/Desk-*.js');
  await page.getByRole('button', { name: 'Reload' }).click();
  await expect(page.locator('.desk')).toBeAttached();
  await expect(page.locator('blockquote')).toBeVisible();
});

test('requests today’s quote once, in parallel with the bundle', async ({ page }) => {
  const problems = browserProblems(page);
  page.on('console', (message) => {
    if (message.type() === 'warning') problems.push(`console warning: ${message.text()}`);
  });
  const quoteRequests: string[] = [];
  const bootstrapRequests: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname === '/api/quote/today') quoteRequests.push(request.url());
    if (pathname === '/color-scheme.js' || pathname === '/request-today.js') {
      bootstrapRequests.push(request.url());
    }
  });

  await page.goto('/');
  await expect(page.locator('blockquote')).toBeVisible();
  await page.waitForTimeout(3500);

  expect(quoteRequests).toHaveLength(1);
  expect(bootstrapRequests).toEqual([]);
  expect(problems).toEqual([]);
});

test('loads the desk on early scrolling while the quote request is still pending', async ({
  page,
}) => {
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/quote/today', async (route) => {
    await pending;
    await route.continue();
  });
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.scene-lamp')).toBeAttached();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator('.desk')).toBeAttached();
    await expect(page.locator('blockquote')).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.locator('blockquote')).toBeAttached();
});

test('has a social preview card with a published image', async ({ page, request }) => {
  await page.goto('/');
  const image = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(image).toBe('https://somequote.com/og-image.png');
  expect(await page.locator('meta[name="twitter:card"]').getAttribute('content')).toBe(
    'summary_large_image',
  );

  const response = await request.get(new URL(image ?? '').pathname);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('image/png');
});

test('fits the viewport without horizontal scrolling', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('blockquote')).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('scene motion eases into its resting states in both scroll directions', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('blockquote')).toBeVisible();

  const samples = await page.evaluate(async () => {
    document.documentElement.style.scrollSnapType = 'none';
    const desk = document.querySelector('.scene-lamp');
    const stage = document.querySelector('.lamp-stage');
    const quote = document.querySelector('.scene-content');
    if (!desk || !stage || !quote) throw new Error('Missing scene');
    const distance = desk.getBoundingClientRect().top + window.scrollY;
    const progress = [0, 0.02, 0.25, 0.5, 0.75, 0.98, 1, 0.98, 0.75, 0.5, 0.25, 0.02, 0];
    const samples = [];
    for (const fraction of progress) {
      window.scrollTo(0, distance * fraction);
      // Scroll timelines can be sampled after the first rendering update in WebKit.
      for (let frame = 0; frame < 3; frame++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      const stageStyle = getComputedStyle(stage);
      const quoteStyle = getComputedStyle(quote);
      samples.push({
        scale: new DOMMatrix(stageStyle.transform).a,
        opacity: Number(stageStyle.opacity),
        quoteScale: new DOMMatrix(quoteStyle.transform).a,
        quoteOpacity: Number(quoteStyle.opacity),
      });
    }
    document.documentElement.style.removeProperty('scroll-snap-type');
    return samples;
  });

  const restingDesk = samples[6];
  expect(restingDesk?.scale).toBeCloseTo(1, 4);
  expect(restingDesk?.opacity).toBe(1);
  for (const index of [5, 7]) {
    expect(Math.abs((samples[index]?.scale ?? 0) - 1)).toBeLessThan(0.003);
    expect(Math.abs((samples[index]?.opacity ?? 0) - 1)).toBeLessThan(0.01);
  }
  for (const index of [0, 1, 11, 12]) {
    expect(samples[index]?.quoteScale).toBeCloseTo(1, 3);
    expect(samples[index]?.quoteOpacity).toBeGreaterThan(0.99);
  }
  for (let index = 1; index <= 6; index++) {
    expect(samples[index]?.scale).toBeGreaterThanOrEqual(samples[index - 1]?.scale ?? 0);
    expect(samples[index]?.scale).toBeCloseTo(samples[12 - index]?.scale ?? 0, 4);
  }
});

test('the lamp switches the color scheme and the choice survives a reload', async ({ page }) => {
  const problems = browserProblems(page);
  await page.goto('/');
  const scheme = () => page.evaluate(() => document.documentElement.dataset.colorScheme);
  const before = await scheme();

  await page.getByRole('button', { name: /Turn the lamp/ }).click();
  await expect.poll(scheme).not.toBe(before);
  const chosen = await scheme();
  await page.reload();

  expect(await scheme()).toBe(chosen);
  expect(problems).toEqual([]);
});

test('serves fingerprinted bundles as immutable', async ({ page, request }) => {
  await page.goto('/');
  const bundle = await page.locator('script[type="module"][src^="/assets/"]').getAttribute('src');
  expect(bundle).toMatch(/^\/assets\/index-[\w-]+\.js$/);

  const response = await request.get(bundle ?? '');

  expect(response.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
});
