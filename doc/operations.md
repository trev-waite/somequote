# Operations

Cloudflare and GitHub setup that lives outside the repository.

## Deploying

Merging to `main` deploys through CI. Before the first deploy, `somequote.com` must be active in the same Cloudflare account with no apex `A`, `AAAA`, or `CNAME` record. Don't connect Workers Builds, because it would deploy without CI's checks.

To deploy manually, run Actions → CI/CD → Run workflow on `main`, using the same checks and `prod` environment as a merge.

## Release versions

The root `package.json` versions the whole deployed app. For every PR with non-Markdown changes, run `bun pm version patch --no-git-tag-version` at the root and commit the change. Choose `minor` for features or `major` for breaking changes. Markdown-only changes need no bump and don't deploy automatically.

CI requires a stable version higher than the PR base. Check locally with `RELEASE_BASE_REF=origin/main bun run release:check`. If another PR lands first, update your branch and bump again.

After production passes its smoke test, CI publishes `v<version>` at the deployed commit with generated GitHub release notes. Cloudflare uses the same tag. No additional secrets are needed.

An existing tag for a different commit blocks deployment before migrations; exact-commit retries are allowed. Stale or failed deployments publish no release. Worker rollback uses Cloudflare version IDs and doesn't undo D1 migrations or seeded content.

If release publication fails after a healthy deployment, re-run only the failed release job. GitHub can reject an older commit whose workflows differ from `main`; an owner must then create the missing tag at the deployed SHA using their own account before retrying. Releases record deployment history; check the `prod` environment or Cloudflare for the current live deployment.

## Zone configuration

Run Actions → Zone settings on `main`, first without *Apply* to see the plan and then with it. Locally, run `bun run --cwd apps/web zone:plan` or `zone:apply` with `CLOUDFLARE_API_TOKEN` set. To finish DNSSEC, add the DS record the script prints at your registrar.

## Credentials

Set these as secrets of the `prod` environment in Settings → Environments, which only `main` may deploy from:

| Secret | Scope |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | The account that owns the Worker, D1, and the domain. |
| `CLOUDFLARE_DEPLOY_TOKEN` | Account: Workers Admin, D1 Write, Account Settings Read. Zone `somequote.com`: Workers Routes Write. |
| `CLOUDFLARE_ZONE_TOKEN` | Zone `somequote.com`: Zone Read, Zone Settings Write, Zone WAF Write, Dynamic URL Redirects Write, DNS Write, Bot Management Write. |

Both tokens expire on **October 21, 2027**. Renew them in Cloudflare and update the secrets before then.

## Limits

The Free plans allow 100,000 Worker requests per day and 5 million D1 rows read per day. Hitting either causes failures, not charges. Upgrade to Workers Paid if traffic approaches them.
