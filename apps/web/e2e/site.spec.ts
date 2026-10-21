import { expect, type Page, test } from '@playwright/test';
import { PublicationDto } from '../src/shared/api-contract';

/** Console errors, uncaught exceptions, CSP violations, and failed requests, as they happen. */
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
  expect(headers['content-security-policy']).toContain("script-src 'self'");
  expect(headers['strict-transport-security']).toBe('max-age=63072000; includeSubDomains');
  expect(headers['x-content-type-options']).toBe('nosniff');
  await expect(page.locator('blockquote .visually-hidden')).toHaveText(`“${quote.text}”`);
  await expect(page.locator('figcaption')).toContainText(
    quote.category === 'general' ? quote.author : quote.reference,
  );
  expect(await page.evaluate(() => document.fonts.check('400 1em "Instrument Serif"'))).toBe(true);
  expect(problems).toEqual([]);
});

test('fits the viewport without horizontal scrolling', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('blockquote')).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
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
