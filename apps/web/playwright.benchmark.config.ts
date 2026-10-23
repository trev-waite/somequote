import { defineConfig } from '@playwright/test';
import config from './playwright.config';

export default defineConfig({
  ...config,
  testDir: './benchmarks',
  outputDir: './benchmark-results',
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['json', { outputFile: 'benchmark-results/report.json' }]],
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  use: {
    ...config.use,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    actionTimeout: 10_000,
    trace: 'off',
  },
});
