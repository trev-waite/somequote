import { expect, type Page, test } from '@playwright/test';

declare global {
  interface Window {
    benchmark: {
      quoteReady: number | null;
      firstWord: number | null;
      initialElements: number;
      frames: number[];
      frame: number;
      geometryChanges: number;
      matrixReads: number;
      pointerId: number;
      mutations?: MutationObserver;
    };
  }
}

const samples = 3;
const percentile = (values: readonly number[], fraction: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
};

async function frames(page: Page, count = 60) {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        const tick = () => {
          if (--count <= 0) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    count,
  );
}

test.beforeEach(async ({ context, browserName }) => {
  await context.setExtraHTTPHeaders({
    'CF-Connecting-IP': `10.${[...crypto.getRandomValues(new Uint8Array(3))].join('.')}`,
  });
  if (browserName === 'webkit') {
    // WebKit upgrades loopback HTTP assets to TLS. Keep the rest of the production CSP intact.
    await context.route('**/*', async (route) => {
      const response = await route.fetch();
      const headers = { ...response.headers() };
      headers['content-security-policy'] =
        headers['content-security-policy']?.replace(/;?\s*upgrade-insecure-requests/g, '') ?? '';
      await route.fulfill({ response, headers });
    });
  }
  await context.addInitScript(() => {
    window.benchmark = {
      quoteReady: null,
      firstWord: null,
      initialElements: 0,
      frames: [],
      frame: 0,
      geometryChanges: 0,
      matrixReads: 0,
      pointerId: 0,
    };
    document.addEventListener('pointerdown', (event) => {
      window.benchmark.pointerId = event.pointerId;
    });
    const observer = new MutationObserver(() => {
      if (!document.querySelector('blockquote .word')) return;
      window.benchmark.quoteReady = performance.now();
      window.benchmark.initialElements = document.querySelectorAll('*').length;
      observer.disconnect();
      const visible = () => {
        const word = document.querySelector('blockquote .word');
        if (word && Number(getComputedStyle(word).opacity) >= 0.5) {
          window.benchmark.firstWord = performance.now();
        } else requestAnimationFrame(visible);
      };
      requestAnimationFrame(visible);
    });
    observer.observe(document, { subtree: true, childList: true });
  });
});

test('reports quote startup across cold, warm, and constrained loads', async ({
  page,
  context,
  browser,
  browserName,
}, testInfo) => {
  const session = browserName === 'chromium' ? await context.newCDPSession(page) : null;
  const modes =
    browserName === 'chromium'
      ? [...Array.from({ length: samples }, () => ['cold', 'warm']).flat(), 'constrained']
      : Array<string>(samples).fill('cold');
  const results = [];
  for (const mode of modes) {
    if (mode !== 'warm') await session?.send('Network.clearBrowserCache');
    if (mode === 'constrained') {
      await session?.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 100,
        downloadThroughput: 200_000,
        uploadThroughput: 100_000,
      });
      await session?.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    }
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.benchmark.firstWord !== null);
    const result = await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource');
      const api = resources.filter((entry) => new URL(entry.name).pathname === '/api/quote/today');
      const entry = api[0];
      const bundle = resources.find((entry) => /\/assets\/index-.*\.js$/.test(entry.name));
      return {
        quoteReadyMs: window.benchmark.quoteReady,
        firstWordMs: window.benchmark.firstWord,
        firstPaintMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
        apiStartMs: entry?.startTime,
        apiEndMs: entry ? entry.startTime + entry.duration : undefined,
        apiBeforeBundleEnd: Boolean(
          entry && bundle && entry.startTime <= bundle.startTime + bundle.duration,
        ),
        apiRequests: api.length,
        initialElements: window.benchmark.initialElements,
      };
    });
    // Routing disables WebKit's cache/preload reuse; Chromium exercises the unmodified HTTP path.
    if (browserName === 'chromium') expect(result.apiRequests).toBe(1);
    expect(result.apiBeforeBundleEnd).toBe(true);
    expect(result.initialElements).toBeLessThan(200);
    results.push({ mode, ...result });
    await expect(page.locator('.desk')).toBeAttached();
  }
  await session?.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await session?.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await session?.detach();
  const report = {
    browser: browserName,
    version: browser.version(),
    webkitCacheDisabledByHttpShim: browserName === 'webkit',
    constrainedProfile:
      '100ms latency, 1.6Mbps down, 4x CPU; local preview transfers uncompressed assets',
    samples: results,
  };
  console.log(JSON.stringify({ startup: report }));
  await testInfo.attach('startup.json', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
});

test('benchmarks scroll and magnifier work and guards against repeated geometry work', async ({
  page,
  browserName,
}, testInfo) => {
  await page.goto('/');
  await expect(page.locator('blockquote')).toBeVisible();
  await page.waitForFunction(
    () => document.querySelector('.publication')?.getAnimations({ subtree: true }).length === 0,
  );
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const grip = page.locator('.magnifier-grip');
  await expect(grip).toBeInViewport();
  await frames(page, 10);

  const session = browserName === 'chromium' ? await page.context().newCDPSession(page) : null;
  await session?.send('Performance.enable');
  const metrics = async (): Promise<Record<string, number>> =>
    session
      ? Object.fromEntries(
          (await session.send('Performance.getMetrics')).metrics.map(({ name, value }) => [
            name,
            value,
          ]),
        )
      : {};
  const measure = async (phase: string, action: () => Promise<void>) => {
    const before = await metrics();
    await page.evaluate(() => {
      window.benchmark.frames = [];
      let last = performance.now();
      const tick = (now: number) => {
        window.benchmark.frames.push(now - last);
        last = now;
        window.benchmark.frame = requestAnimationFrame(tick);
      };
      window.benchmark.frame = requestAnimationFrame(tick);
    });
    await action();
    const after = await metrics();
    const times = await page.evaluate(() => {
      cancelAnimationFrame(window.benchmark.frame);
      return window.benchmark.frames.slice(1);
    });
    const elapsed = times.reduce((sum, value) => sum + value, 0);
    return {
      phase,
      frames: times.length,
      fps: elapsed ? (times.length * 1000) / elapsed : 0,
      p50Ms: percentile(times, 0.5),
      p95Ms: percentile(times, 0.95),
      maxMs: Math.max(0, ...times),
      cpuMsPerSecond: session
        ? Object.fromEntries(
            ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'].map(
              (name) => [
                name,
                (((after[name] ?? 0) - (before[name] ?? 0)) * 1000) /
                  Math.max(0.001, (after.Timestamp ?? 0) - (before.Timestamp ?? 0)),
              ],
            ),
          )
        : null,
    };
  };
  const results = [];
  for (let sample = 0; sample < samples; sample++) {
    results.push(await measure('desk idle', () => frames(page)));
  }
  await grip.click();
  await page.waitForFunction(() => {
    const lens = document.querySelector('.magnifier-lens');
    return lens && Number(getComputedStyle(lens).opacity) === 1;
  });
  for (let sample = 0; sample < samples; sample++) {
    results.push(await measure('held idle', () => frames(page)));
  }
  await page.evaluate(() => {
    const held = document.querySelector('.magnifier-held');
    if (!held) throw new Error('Missing raised glass');
    window.benchmark.mutations = new MutationObserver((changes) => {
      window.benchmark.geometryChanges += changes.length;
    });
    window.benchmark.mutations.observe(held, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['d', 'viewBox', 'href', 'clip-path'],
    });
    const original = SVGGraphicsElement.prototype.getScreenCTM;
    SVGGraphicsElement.prototype.getScreenCTM = function () {
      window.benchmark.matrixReads++;
      return original.call(this);
    };
  });
  for (let sample = 0; sample < samples; sample++) {
    const box = await grip.boundingBox();
    if (!box) throw new Error('Missing glass handle');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    results.push(
      await measure('dragging', async () => {
        const moved = await page.evaluate(
          async ({ x, y }) => {
            const grip = document.querySelector('.magnifier-grip');
            const held = document.querySelector('.magnifier-held');
            if (!grip) throw new Error('Missing glass handle');
            const original = held?.getAttribute('style');
            let moved = false;
            for (let index = 1; index <= 60; index++) {
              await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
              const angle = (index / 60) * Math.PI * 2;
              grip.dispatchEvent(
                new PointerEvent('pointermove', {
                  bubbles: true,
                  pointerId: window.benchmark.pointerId,
                  pointerType: 'mouse',
                  clientX: x + Math.cos(angle) * 50 - 50,
                  clientY: y + Math.sin(angle) * 30,
                }),
              );
              moved ||= held?.getAttribute('style') !== original;
            }
            return moved;
          },
          { x, y },
        );
        expect(moved).toBe(true);
      }),
    );
    await page.mouse.up();
  }
  const work = await page.evaluate(() => {
    window.benchmark.mutations?.disconnect();
    return {
      geometryChanges: window.benchmark.geometryChanges,
      matrixReads: window.benchmark.matrixReads,
    };
  });
  expect(work.geometryChanges).toBe(0);
  expect(work.matrixReads).toBeGreaterThanOrEqual(samples);
  expect(work.matrixReads).toBeLessThanOrEqual(samples * 2);
  const layers = await page.evaluate(() => {
    const style = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      return getComputedStyle(element);
    };
    return {
      glass: style('.magnifier-held').willChange,
      view: style('.magnifier-view').willChange,
      clock: style('.clock-layer').willChange,
      filter: style('.lamp-stage').filter,
      fill: style('.lamp-stage').animationFillMode,
      quoteFill: style('.scene-content').animationFillMode,
      copies: [...document.querySelectorAll('.magnifier-view')].map((view) =>
        [...view.querySelectorAll('use')].map((copy) => copy.getAttribute('href')),
      ),
    };
  });
  expect(layers).toEqual({
    glass: 'transform',
    view: 'transform',
    clock: 'transform',
    filter: 'none',
    fill: 'none',
    quoteFill: 'none',
    copies: [
      ['#desk-body', '#desk-ship', '#desk-cord', '#desk-above'],
      ['#desk-clock', '#envelope-scene'],
    ],
  });
  await page.keyboard.press('Escape');
  results.push(
    await measure('scroll up and down', async () => {
      await page.evaluate(async () => {
        document.documentElement.style.scrollSnapType = 'none';
        const end = document.documentElement.scrollHeight - innerHeight;
        for (const direction of [-1, 1]) {
          for (let index = 0; index <= 60; index++) {
            scrollTo(0, end * (direction === -1 ? 1 - index / 60 : index / 60));
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            if (index === 30) {
              const stage = document.querySelector('.lamp-stage');
              if (!stage || getComputedStyle(stage).filter !== 'none') {
                throw new Error('A scene filter would flatten the desk compositor layers');
              }
            }
          }
        }
        document.documentElement.style.removeProperty('scroll-snap-type');
      });
    }),
  );
  await session?.detach();
  const report = { browser: browserName, work, layers, samples: results };
  console.log(JSON.stringify({ interaction: report }));
  await testInfo.attach('interaction.json', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
});
