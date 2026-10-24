import { expect, test } from '@playwright/test';

test.beforeEach(async ({ browserName, context }) => {
  if (browserName !== 'webkit') return;
  // WebKit upgrades loopback assets to TLS; only remove that directive for the local preview.
  await context.route('**/*', async (route) => {
    const response = await route.fetch();
    const headers = { ...response.headers() };
    headers['content-security-policy'] =
      headers['content-security-policy']?.replace(/;?\s*upgrade-insecure-requests/g, '') ?? '';
    await route.fulfill({ response, headers });
  });
});

test('the 404 artwork stays inside the scene padding on narrow phones and in landscape', async ({
  page,
}) => {
  await page.goto('/404');
  await expect(page.getByRole('button', { name: 'Look through the spyglass' })).toHaveAttribute(
    'aria-disabled',
    'false',
  );

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    const layout = await page.locator('.not-found-page').evaluate((scene) => {
      const art = scene.querySelector('.not-found-art');
      if (!art) throw new Error('Missing 404 artwork');
      const box = scene.getBoundingClientRect();
      const drawing = art.getBoundingClientRect();
      const style = getComputedStyle(scene);
      return {
        left: drawing.left,
        right: drawing.right,
        safeLeft: box.left + Number.parseFloat(style.paddingLeft),
        safeRight: box.right - Number.parseFloat(style.paddingRight),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    expect(layout.left, `left inset at ${viewport.width}px`).toBeGreaterThanOrEqual(
      layout.safeLeft - 0.5,
    );
    expect(layout.right, `right inset at ${viewport.width}px`).toBeLessThanOrEqual(
      layout.safeRight + 0.5,
    );
    expect(layout.overflow).toBeLessThanOrEqual(0);
  }
});

test('the 404 follows system appearance and tints browser chrome while honoring the saved lamp choice', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/404');
  await expect(page.getByRole('button', { name: 'Look through the spyglass' })).toBeAttached();
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'light');

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    'content',
    /^#(?:000|000000)$/i,
  );
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute(
    'content',
    'black-translucent',
  );

  await page.evaluate(() => localStorage.setItem('somequote.color-scheme', 'light'));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Look through the spyglass' })).toBeAttached();
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'light');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    'content',
    /^#(?:fff|ffffff)$/i,
  );
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute(
    'content',
    'default',
  );

  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'light');
});
