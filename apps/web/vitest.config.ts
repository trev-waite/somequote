import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [
          cloudflareTest(async () => ({
            wrangler: { configPath: './wrangler.jsonc' },
            miniflare: {
              bindings: { TEST_MIGRATIONS: await readD1Migrations('./migrations') },
            },
          })),
        ],
        test: {
          name: 'worker',
          include: ['src/worker/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'client',
          environment: 'happy-dom',
          include: ['src/client/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
