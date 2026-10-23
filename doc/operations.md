# Operations

Cloudflare and GitHub setup that lives outside the repository.

## Deploying

Merging to `main` deploys through CI. Before the first deploy, `somequote.com` must be active in the same Cloudflare account with no apex `A`, `AAAA`, or `CNAME` record. Don't connect Workers Builds, because it would deploy without CI's checks.

To deploy manually:

```bash
cd apps/web && bunx wrangler login
bun run db:migrate:remote && bun run db:seed:remote && bun run deploy
```

## Zone configuration

Run Actions → Zone settings on `main`, first without *Apply* to see the plan and then with it. Locally, run `bun run --cwd apps/web zone:plan` or `zone:apply` with `CLOUDFLARE_API_TOKEN` set. To finish DNSSEC, add the DS record the script prints at your registrar.

## Credentials

Set these as secrets of the `prod` environment in Settings → Environments, which only `main` may deploy from:

| Secret | Scope |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | The account that owns the Worker, D1, and the domain. |
| `CLOUDFLARE_DEPLOY_TOKEN` | Account: Workers Admin, D1 Write, Account Settings Read. Zone `somequote.com`: Workers Routes Write. |
| `CLOUDFLARE_ZONE_TOKEN` | Zone `somequote.com`: Zone Read, Zone Settings Write, Zone WAF Write, Dynamic URL Redirects Write, DNS Write. |

Both tokens expire on **October 21, 2027**. Renew them in Cloudflare and update the secrets before then.

## Limits

The Free plans allow 100,000 Worker requests per day and 5 million D1 rows read per day. Hitting either causes failures, not charges. Upgrade to Workers Paid if traffic approaches them.
