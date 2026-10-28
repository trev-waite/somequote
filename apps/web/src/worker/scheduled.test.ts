import { createScheduledController } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { addDays, parsePublicationDate, publicationStartsAt } from '@somequote/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import wranglerConfig from '../../wrangler.jsonc?raw';
import worker from './index';
import { generalQuote, insertQuotes, publicationRows, quotes, resetDatabase } from './test-support';

async function fire(cron: string, scheduledTime: string) {
  await worker.scheduled(
    createScheduledController({ cron, scheduledTime: new Date(scheduledTime) }),
    env,
  );
}

const configuredCrons = (() => {
  const match = /"crons":\s*\[([^\]]*)\]/.exec(wranglerConfig);
  return [...(match?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((cron) => cron[1] ?? '');
})();

beforeEach(async () => {
  await resetDatabase();
  await insertQuotes(quotes('general', 10, generalQuote));
});

describe('scheduled publication', () => {
  it('publishes at midnight during daylight time and treats the later trigger as a no-op', async () => {
    await fire('0 4 * * *', '2026-07-15T04:00:00Z');
    const afterMidnight = await publicationRows();
    await fire('0 5 * * *', '2026-07-15T05:00:00Z');

    expect(afterMidnight.map((row) => row.publish_date)).toEqual(['2026-07-15']);
    expect(await publicationRows()).toEqual(afterMidnight);
  });

  it('publishes at midnight during standard time, when the earlier trigger is still the day before', async () => {
    await fire('0 4 * * *', '2027-01-15T04:00:00Z');
    await fire('0 5 * * *', '2027-01-15T05:00:00Z');

    expect((await publicationRows()).map((row) => row.publish_date)).toEqual([
      '2027-01-14',
      '2027-01-15',
    ]);
  });

  it('converges when a trigger is retried', async () => {
    await fire('0 4 * * *', '2026-10-19T04:00:00Z');
    const first = await publicationRows();
    await fire('0 4 * * *', '2026-10-19T04:00:00Z');

    expect(await publicationRows()).toEqual(first);
  });

  it('fails the run and logs why when nothing can be published', async () => {
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await env.DB.prepare('UPDATE quotes SET enabled = 0').run();

    await expect(fire('0 4 * * *', '2026-10-19T04:00:00Z')).rejects.toThrow();

    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'ERROR',
        message: 'Scheduled publication failed',
        annotations: { cron: '0 4 * * *', date: '2026-10-19' },
      }),
    );
    logError.mockRestore();
  });

  it('has a configured trigger at Eastern midnight on every day', () => {
    const hours = configuredCrons.map((cron) => {
      const match = /^0 (\d{1,2}) \* \* \*$/.exec(cron);
      if (!match) throw new Error(`Unexpected cron expression: ${cron}`);
      return Number(match[1]);
    });

    for (let day = parsePublicationDate('2026-01-01'); day < '2031-01-01'; day = addDays(day, 1)) {
      const midnight = publicationStartsAt(day);
      expect(midnight.getUTCMinutes()).toBe(0);
      expect(hours).toContain(midnight.getUTCHours());
    }
  });
});
