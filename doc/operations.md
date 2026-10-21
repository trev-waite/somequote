# Operations

What the repository cannot enforce itself: Cloudflare and GitHub setup, credentials, and account limits.

## Deploying

Merging to `main` deploys. Before the first deploy, `somequote.com` must be active in the same Cloudflare account with no conflicting apex `A`, `AAAA`, or `CNAME` record; Cloudflare then attaches it as the Worker's Custom Domain and issues the certificate.

To deploy from your own machine:

```bash
cd apps/web && bunx wrangler login
bun run db:migrate:remote && bun run db:seed:remote && bun run deploy
```

Do not connect the repository to Cloudflare Workers Builds. It would deploy every push outside CI's checks and rollback.

## Zone configuration

Apply after the first deploy and whenever zone policy changes: Actions → Zone settings → Run workflow on `main`. Leave *Apply* unticked to print the plan, then run again with it ticked. Locally, set `CLOUDFLARE_API_TOKEN` and run `bun run --cwd apps/web zone:plan` or `zone:apply`.

- The Free plan allows one rate limiting rule. If you created one by hand, delete it first.
- Add the DS record the script prints at your registrar to finish DNSSEC.
- Afterwards, check that `http://somequote.com` and `https://www.somequote.com/?a=1` redirect to `https://somequote.com/` with the query kept, the site and API load, a short burst of API requests is blocked, and both cron triggers appear under the Worker's Settings → Triggers.

HSTS preload is deliberately off. Submitting to [hstspreload.org](https://hstspreload.org) needs `; preload` on both HSTS headers, is slow to undo, and makes every subdomain HTTPS-only permanently. Add it once the domain is settled.

## Credentials

Repository secrets, in Settings → Secrets and variables → Actions:

| Secret | Scope |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Account owning the Worker, D1 database, and domain (dashboard search → Copy account ID). |
| `CLOUDFLARE_DEPLOY_TOKEN` | `somequote-github-deploy`: Entire Account → Workers Admin, D1 Write, Account Settings Read; Specified Domains → `somequote.com` → Workers Routes Write. |
| `CLOUDFLARE_ZONE_TOKEN` | `somequote-github-zone`: Specified Domains → `somequote.com` → Zone Read, Zone Settings Write, Zone WAF Write, Dynamic URL Redirects Write, DNS Write. |

Both API tokens expire on **October 21, 2027**. Renew them in Cloudflare → Manage Account → Account API Tokens and replace the GitHub secrets before then. Client IP filtering is unset because GitHub-hosted runners change addresses. On an authentication error, check the token's permissions, scope, expiry, and the secret value.

On GitHub Free with a private repository there is no branch protection or environment secrets: nothing blocks merging while checks are red (deploy still waits for them), and workflows on any branch can read the secrets. Keep the tokens narrowly scoped.

## Account limits

- Workers Free includes [100,000 requests per day](https://developers.cloudflare.com/workers/platform/limits/) per account; D1 Free includes [5 million rows read and 100,000 written per day](https://developers.cloudflare.com/d1/platform/pricing/). Exhaustion causes failures, not charges.
- The edge rate limit still lets one address reach the Worker about 43,000 times a day, so a few addresses can exhaust the request quota. Workers Paid removes that risk.
- The in-Worker rate limiter uses namespace `1001`. Change it if another Worker in the account uses that namespace.
- Watch Worker requests, D1 row usage, and 429s, and adjust thresholds if legitimate traffic is blocked.

## Secret scanning

Run `bun run hooks:install` once per clone so pushes are scanned before they leave your machine. `bun run scan:secrets` scans the whole history. Mark a deliberate test value with `secret-scan: allow`. If a real credential is found, rotate it first: once pushed, it has left your machine.
