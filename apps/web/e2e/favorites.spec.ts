import { expect, type Page, test } from '@playwright/test';

const today = {
  date: '2026-11-24',
  quote: {
    category: 'general',
    id: 'favorites-e2e-today',
    text: 'If you laugh, you think, and you cry, that’s a full day.',
    author: 'Jim Valvano',
    source: 'ESPY Awards speech, 1993',
  },
} as const;

async function showDesk(page: Page) {
  await page.locator('.scene-lamp').evaluate((scene) => scene.scrollIntoView());
  await expect
    .poll(() =>
      page
        .locator('.lamp-stage')
        .evaluate(
          (stage) => stage.getBoundingClientRect().width / (stage as HTMLElement).offsetWidth,
        ),
    )
    .toBeCloseTo(1, 2);
}

test.beforeEach(async ({ page, browserName, context }) => {
  if (browserName === 'webkit') {
    // WebKit upgrades loopback assets to TLS; only remove that directive for the local preview.
    await context.route('**/*', async (route) => {
      const response = await route.fetch();
      const headers = { ...response.headers() };
      headers['content-security-policy'] =
        headers['content-security-policy']?.replace(/;?\s*upgrade-insecure-requests/g, '') ?? '';
      await route.fulfill({ response, headers });
    });
  }
  await page.route('**/api/quote/today', (route) => route.fulfill({ json: today }));
});

/**
 * Every point of a 44px square at the target's centre lands on it, not just its bounding box, on
 * the smallest phone the desk is drawn for.
 */
async function expectTapTarget(page: Page, selector: string) {
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 320, height: 568 });
  await showDesk(page);
  const misses = await page.locator(selector).evaluate((target) => {
    const { left, top, width, height } = target.getBoundingClientRect();
    const [x, y] = [left + width / 2, top + height / 2];
    const offsets = [-21, -10, 0, 10, 21];
    return offsets.flatMap((dx) =>
      offsets
        .filter((dy) => document.elementFromPoint(x + dx, y + dy) !== target)
        .map((dy) => `${dx},${dy}`),
    );
  });
  expect(misses).toEqual([]);
  if (viewport) await page.setViewportSize(viewport);
  await showDesk(page);
}

test('keeps today’s quote in the card box on the desk, with removal undoable', async ({ page }) => {
  await page.goto('/');
  const heart = page.getByRole('button', { name: 'Favorite', exact: true });
  await expect(heart).toHaveAttribute('aria-pressed', 'false');
  const size = await heart.boundingBox();
  expect(size?.width).toBeGreaterThanOrEqual(44);
  expect(size?.height).toBeGreaterThanOrEqual(44);
  await heart.click();
  await expect(heart).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await expect(page.getByRole('button', { name: 'Favorite', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  const box = page.getByRole('button', { name: 'Favorites, 1 quote' });
  await showDesk(page);
  await expectTapTarget(page, '.card-box-trigger');
  await box.click();

  const sheet = page.getByRole('dialog', { name: 'Favorites' });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('blockquote')).toHaveText(`“${today.quote.text}”`);
  await sheet.getByRole('button', { name: 'Remove' }).click();
  await expect(sheet.getByRole('button', { name: 'Undo' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Favorites, 0 quotes' })).toBeAttached();
  await sheet.getByRole('button', { name: 'Undo' }).click();
  await expect(sheet.getByRole('button', { name: 'Remove' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(box).toBeFocused();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe(
    'hidden',
  );
});

test('closes the sheet from its scrim and locks the page behind it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Favorite', exact: true }).click();
  const box = page.getByRole('button', { name: 'Favorites, 1 quote' });
  await showDesk(page);
  await box.click();
  const sheet = page.getByRole('dialog', { name: 'Favorites' });
  await expect(sheet).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe(
    'hidden',
  );
  await page.mouse.click(4, 4);
  await expect(sheet).toBeHidden();
});

test('keeps the heart out of reach until the quote reveals it', async ({ page }) => {
  const long = {
    ...today,
    quote: {
      ...today.quote,
      text: 'It is not the critic who counts; not the man who points out how the strong man stumbles, or where the doer of deeds could have done them better. The credit belongs to the man who is actually in the arena.',
    },
  };
  await page.route('**/api/quote/today', (route) => route.fulfill({ json: long }));
  await page.goto('/');
  const heart = page.locator('.favorite-toggle');
  const early = await heart.evaluate((button) => {
    (button as HTMLButtonElement).focus();
    return {
      visibility: getComputedStyle(button).visibility,
      focused: document.activeElement === button,
    };
  });
  expect(early).toEqual({ visibility: 'hidden', focused: false });
  await expect(heart).toBeVisible({ timeout: 10_000 });
  await heart.focus();
  await expect(heart).toBeFocused();
});

test('carries the box’s own card out to the sheet, and back in through a second Escape', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Favorite', exact: true }).click();
  await showDesk(page);
  const boxCard = page.locator('.card-box-card');
  await expect(boxCard).toHaveCSS('visibility', 'visible');
  await page.getByRole('button', { name: 'Favorites, 1 quote' }).click();
  await expect(boxCard).toHaveCSS('visibility', 'hidden');
  const sheet = page.getByRole('dialog', { name: 'Favorites' });
  await expect(sheet.locator('.favorite-header')).toHaveCSS('opacity', '1');
  await sheet.getByRole('button', { name: /^Remove/ }).focus();
  await page.evaluate(() => {
    const dialog = document.querySelector('dialog.favorites') as HTMLDialogElement;
    const box = document.querySelector('.card-box-trigger')?.getBoundingClientRect();
    const frames: { open: boolean; card: boolean; inBox: boolean; boxCard: string }[] = [];
    Reflect.set(window, 'sheetFrames', frames);
    const sample = () => {
      const card = dialog.querySelector('.favorite-card');
      const flight = dialog.querySelector('.flight-card')?.getBoundingClientRect();
      const x = flight ? flight.x + flight.width / 2 : -1;
      const y = flight ? flight.y + flight.height / 2 : -1;
      frames.push({
        open: dialog.open,
        card: !!card && getComputedStyle(card).visibility === 'visible',
        inBox: !!box && x > box.left && x < box.right && y > box.top && y < box.bottom,
        boxCard: getComputedStyle(document.querySelector('.card-box-card') as Element).visibility,
      });
      if (dialog.open) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(30);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('button', { name: 'Favorites, 1 quote' })).toBeFocused();
  await expect(boxCard).toHaveCSS('visibility', 'visible');
  const frames: { open: boolean; card: boolean; inBox: boolean; boxCard: string }[] =
    await page.evaluate(() => Reflect.get(window, 'sheetFrames'));
  const open = frames.filter((frame) => frame.open);
  expect(open.at(-1)).toMatchObject({ card: false, inBox: true, boxCard: 'hidden' });
  expect(open.some((frame) => !frame.inBox)).toBe(true);
});

test('keeps the box’s keyboard highlight while the pointer is over it', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'hover needs a fine pointer');
  await page.goto('/');
  await showDesk(page);
  const box = page.locator('.card-box-trigger');
  const highlight = () =>
    box.evaluate((button) => getComputedStyle(button, '::before').backgroundColor);
  await box.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(box).toBeFocused();
  const focused = await highlight();
  await box.hover();
  expect(await highlight()).toBe(focused);
});

test('fills the box’s heart with red on hover, without tinting the box', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'hover needs a fine pointer');
  await page.goto('/');
  await showDesk(page);
  const box = page.locator('.card-box-trigger');
  const fill = page.locator('.card-box-mark .heart-fill');
  const scale = () => fill.evaluate((rect) => new DOMMatrix(getComputedStyle(rect).transform).d);
  expect(await scale()).toBe(0);
  await box.hover();
  await expect.poll(scale).toBe(1);
  expect(await fill.evaluate((rect) => getComputedStyle(rect).fill)).toBe('rgb(229, 72, 77)');
  expect(await box.evaluate((button) => getComputedStyle(button, '::before').backgroundColor)).toBe(
    'rgba(0, 0, 0, 0)',
  );
  await page.mouse.move(0, 0);
  await expect.poll(scale).toBe(0);
});

test('keeps the box’s heart red on touch screens while it holds a favorite', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'a fine pointer shows the red on hover instead');
  await page.goto('/');
  const fill = page.locator('.card-box-mark .heart-fill');
  const outline = page.locator('.card-box-mark .heart-outline');
  const scale = () => fill.evaluate((rect) => new DOMMatrix(getComputedStyle(rect).transform).d);
  const stroke = () => outline.evaluate((path) => getComputedStyle(path).stroke);
  await showDesk(page);
  expect(await scale()).toBe(0);
  expect(await stroke()).not.toBe('rgb(229, 72, 77)');
  await page.locator('.scene-quote').evaluate((scene) => scene.scrollIntoView());
  await page.getByRole('button', { name: 'Favorite', exact: true }).click();
  await showDesk(page);
  await expect.poll(scale).toBe(1);
  expect(await stroke()).toBe('rgb(229, 72, 77)');
});

test('fills the quote’s heart with red progressively when pressed, and drains it', async ({
  page,
}) => {
  await page.goto('/');
  const heart = page.getByRole('button', { name: 'Favorite', exact: true });
  await expect(heart).toBeVisible();
  const fill = heart.locator('.heart-fill');
  const scale = () => fill.evaluate((rect) => new DOMMatrix(getComputedStyle(rect).transform).d);
  expect(await scale()).toBe(0);
  const rising = await heart.evaluate(async (button) => {
    const rect = button.querySelector('.heart-fill') as SVGRectElement;
    const read = () => new DOMMatrix(getComputedStyle(rect).transform).d;
    (button as HTMLButtonElement).click();
    for (let frame = 0; frame < 30 && rect.getAnimations().length === 0; frame++) {
      await new Promise(requestAnimationFrame);
    }
    const [transition] = rect.getAnimations();
    if (!transition) return [];
    transition.pause();
    const duration = Number(transition.effect?.getComputedTiming().duration);
    const values = [0.25, 0.5, 0.75].map((at) => {
      transition.currentTime = at * duration;
      return read();
    });
    transition.play();
    return values;
  });
  expect(rising).toHaveLength(3);
  expect(rising.every((value, index) => value > (rising[index - 1] ?? 0) && value < 1)).toBe(true);
  await expect.poll(scale).toBe(1);
  expect(await fill.evaluate((rect) => getComputedStyle(rect).fill)).toBe('rgb(229, 72, 77)');
  await heart.click();
  await expect.poll(scale).toBe(0);
});
