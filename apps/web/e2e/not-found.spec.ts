import { expect, test } from '@playwright/test';
import { BACK_AT } from '../src/client/not-found/quote-letters';

test('unknown page visits redirect to the custom 404 without requesting a daily quote', async ({
  page,
}) => {
  const quoteRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/quote/today') quoteRequests.push(request.url());
  });
  const response = await page.goto('/onfjr?next=https://example.com');

  await expect(page).toHaveURL('/404');
  expect(response?.status()).toBe(404);
  await expect(page).toHaveTitle('Page not found · SomeQuote');
  await expect(page.getByRole('heading', { name: '404 — Page not found' })).toBeAttached();
  await expect(page.getByRole('blockquote')).toHaveText(
    '“Not till we are lost … do we begin to find ourselves.”',
  );
  expect(response?.headers()['x-robots-tag']).toBe('noindex');
  expect(response?.headers()['content-security-policy']).toContain("script-src 'self' 'sha384-");
  expect(await page.locator('link[rel="canonical"]').count()).toBe(0);
  expect(quoteRequests).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0);

  const home = page.getByRole('link', { name: 'Back to today’s quote' });
  const homeBox = await home.boundingBox();
  const artBox = await page.locator('.not-found-art').boundingBox();
  if (!homeBox || !artBox) throw new Error('The 404 page is missing its link or drawing');
  expect(homeBox.y + homeBox.height).toBeLessThanOrEqual(artBox.y);

  await home.click();
  await expect(page).toHaveURL('/');
  await expect(page.locator('blockquote')).toBeVisible();
});

test('the spyglass turns the 404 into the quote letter by letter, then back', async ({ page }) => {
  await page.clock.install();
  await page.goto('/404');
  const trigger = page.getByRole('button', { name: 'Look through the spyglass' });
  await expect(trigger).toHaveAttribute('aria-disabled', 'false');
  const spyglass = page.locator('.not-found-spyglass');
  const letters = page.locator('.quote-letter');
  const resting = await spyglass.innerHTML();
  const quote = (await page.getByRole('blockquote').textContent()) ?? '';
  await expect(letters).toHaveCount(0);

  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-disabled', 'true');
  await expect(trigger).toBeFocused();
  await expect(trigger).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await page.clock.runFor(6000);
  await expect(letters).toHaveCount(quote.replace(/\s/g, '').length);
  expect(await spyglass.innerHTML()).not.toBe(resting);

  await page.clock.runFor(14_000);
  await expect(letters).toHaveCount(0);
  await expect(trigger).toHaveAttribute('aria-disabled', 'false');
  expect(await spyglass.innerHTML()).toBe(resting);
});

test('the spyglass itself switches to the quote in dark mode, without moving when motion is reduced', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto('/404');
  const trigger = page.getByRole('button', { name: 'Look through the spyglass' });
  await expect(trigger).toHaveAttribute('aria-disabled', 'false');
  const spyglass = page.locator('.not-found-spyglass');
  const letters = page.locator('.quote-letter');
  const resting = await spyglass.innerHTML();
  const bounds = await spyglass.boundingBox();
  if (!bounds) throw new Error('Spyglass illustration is missing');
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);

  const status = page.getByRole('status');
  await expect(status).toHaveText('The spyglass looks over the 404, and it becomes a quote.');
  await expect(letters.first()).toBeAttached();
  expect(await spyglass.innerHTML()).toBe(resting);

  await page.clock.runFor(9000);
  await expect(status).toHaveText('');
  await expect(letters).toHaveCount(0);
});

test('after a background tab, switching back picks up where the spyglass has got to', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/404');
  const trigger = page.getByRole('button', { name: 'Look through the spyglass' });
  await expect(trigger).toHaveAttribute('aria-disabled', 'false');
  await trigger.click();
  await page.clock.runFor(1000);
  await page.clock.fastForward(BACK_AT + 1500 - 1000);

  const first = page.locator('.quote-letter').first();
  await expect(first).toHaveCSS('animation-direction', 'reverse');
  const delay = await first.evaluate((letter) => getComputedStyle(letter).animationDelay);
  expect(Number.parseFloat(delay)).toBeLessThan(0);
});

test('missing resources and private path probes return 404 without app fallbacks', async ({
  request,
}) => {
  for (const path of [
    '/assets/missing.js',
    '/.env',
    '/.git/config',
    '/src/worker/index.ts',
    '/%2e%2e%2f.env',
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
    expect(response.headers()['content-type'], path).toContain('text/plain');
    expect(response.headers()['x-content-type-options'], path).toBe('nosniff');
    expect(await response.text(), path).toBe('Not found.');
  }

  const api = await request.get('/api/does-not-exist');
  expect(api.status()).toBe(404);
  expect(api.headers()['content-type']).toContain('application/json');

  const head = await request.head('/404');
  expect(head.status()).toBe(404);
  expect(await head.body()).toHaveLength(0);
});
