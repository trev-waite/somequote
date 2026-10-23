import { expect, test } from '@playwright/test';

const QUOTES = [
  {
    text: 'Our life is frittered away by detail.',
    author: 'Henry David Thoreau',
    source: 'Walden',
  },
  {
    text: 'Achievement, of whatever kind, is the crown of effort, the diadem of thought.',
    author: 'James Allen',
    source: 'As a Man Thinketh',
  },
];

const WIDTHS = [390, 768, 1280];

test.use({ reducedMotion: 'reduce' });

test.beforeEach(async ({ context }) => {
  // WebKit upgrades loopback HTTP assets to TLS. Keep the rest of the production CSP intact.
  await context.route('**/*', async (route) => {
    const response = await route.fetch();
    const headers = { ...response.headers() };
    headers['content-security-policy'] =
      headers['content-security-policy']?.replace(/;?\s*upgrade-insecure-requests/g, '') ?? '';
    await route.fulfill({ response, headers });
  });
});

for (const { text, author, source } of QUOTES) {
  test(`spaces every word of “${text.slice(0, 24)}…” evenly`, async ({ page }) => {
    const publication = {
      date: '2026-01-01',
      quote: { category: 'general', id: 'spacing', text, author, source },
    };
    await page.route('**/api/quote/today', (route) => route.fulfill({ json: publication }));
    await page.goto('/');
    await expect(page.locator('blockquote .visually-hidden')).toHaveText(`“${text}”`);
    await page.evaluate(() => document.fonts.ready);

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      const gaps = await page.locator('blockquote .word').evaluateAll((words) => {
        const glyphs = words.map((word) => {
          const range = document.createRange();
          range.selectNodeContents(word);
          return range.getBoundingClientRect();
        });
        return glyphs.slice(1).flatMap((glyph, index) => {
          const previous = glyphs[index];
          return previous && Math.abs(previous.top - glyph.top) < 1
            ? [glyph.left - previous.right]
            : [];
        });
      });

      expect(gaps.length, `words sharing a line at ${width}px`).toBeGreaterThan(0);
      expect(Math.max(...gaps) - Math.min(...gaps), `gap spread at ${width}px`).toBeLessThan(1);
    }
  });
}
