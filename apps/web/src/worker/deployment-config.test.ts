import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import ciWorkflow from '../../../../.github/workflows/ci.yml?raw';
import secretsWorkflow from '../../../../.github/workflows/secrets.yml?raw';
import zoneWorkflow from '../../../../.github/workflows/zone.yml?raw';
import headers from '../../public/_headers?raw';
import wranglerConfig from '../../wrangler.jsonc?raw';
import { createApp } from './api/app';
import { D1QuoteRepository } from './db/d1-quote-repository';

describe('deployment configuration', () => {
  it('serves only on the custom domain, where the zone forces HTTPS and applies WAF rules', () => {
    expect(wranglerConfig).toMatch(/"pattern":\s*"somequote\.com",\s*"custom_domain":\s*true/);
    expect(wranglerConfig).toMatch(/"workers_dev":\s*false/);
    expect(wranglerConfig).toMatch(/"preview_urls":\s*false/);
  });

  it('sends the same HSTS policy from static assets and the API', async () => {
    const app = createApp({
      repositoryFor: (bindings) => new D1QuoteRepository(bindings.DB),
      now: () => new Date(),
      random: Math.random,
    });
    const response = await app.request('https://somequote.com/api/missing', {}, env);
    const staticPolicy = /Strict-Transport-Security: (.+)/.exec(headers)?.[1];

    expect(staticPolicy).toBe('max-age=63072000; includeSubDomains');
    expect(response.headers.get('Strict-Transport-Security')).toBe(staticPolicy);
  });

  it.each([
    ['ci.yml', ciWorkflow],
    ['secrets.yml', secretsWorkflow],
    ['zone.yml', zoneWorkflow],
  ])('%s cannot start another run, so a rollback can never loop', (_, workflow) => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: read$/m);
    expect(workflow).not.toMatch(/:\s*write\b|write-all/);
    expect(workflow).not.toMatch(/git push|gh workflow run|\/dispatches|repository_dispatch/);
  });

  it('scans every pushed commit for secrets, with no path filters to skip one', () => {
    expect(secretsWorkflow).toMatch(/branches: \['\*\*'\]/);
    expect(secretsWorkflow).not.toMatch(/paths(?:-ignore)?:/);
    // A concurrency group would let GitHub cancel a pending scan when a third push queues.
    expect(secretsWorkflow).not.toMatch(/^\s*concurrency:/m);
  });

  it('reads the Cloudflare secrets only through the main-only prod environment', () => {
    const deployJob = ciWorkflow.slice(ciWorkflow.indexOf('\n  deploy:'));

    expect(deployJob).toMatch(/^ {4}environment:\n {6}name: prod$/m);
    expect(zoneWorkflow).toMatch(/^ {4}environment: prod$/m);
  });

  it.each([
    ['ci.yml deploy', ciWorkflow.slice(ciWorkflow.indexOf('\n  deploy:'))],
    ['zone.yml zone', zoneWorkflow.slice(zoneWorkflow.indexOf('\n  zone:'))],
  ])(
    '%s keeps the Cloudflare secrets out of dependency installs and third-party actions',
    (_, job) => {
      const [jobHeader = '', ...steps] = job.split(/\n {6}- name: /);
      const exposed = steps.filter(
        (step) => /secrets\.CLOUDFLARE/.test(step) && /\buses:|bun install/.test(step),
      );

      expect(jobHeader).not.toMatch(/secrets\./);
      expect(exposed).toEqual([]);
    },
  );

  it('rolls back at most once per run, after the only deploy', () => {
    const deploys = [...ciWorkflow.matchAll(/wrangler deploy\b/g)];
    const rollbacks = [...ciWorkflow.matchAll(/wrangler rollback\b/g)];

    expect(deploys).toHaveLength(1);
    expect(rollbacks).toHaveLength(1);
    expect(rollbacks[0]?.index).toBeGreaterThan(deploys[0]?.index ?? Infinity);
  });
});
