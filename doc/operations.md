# Operations

Cloudflare and GitHub setup that lives outside the repository.

## Deploying

Merging to `main` deploys through CI. Before the first deploy, `somequote.com` must be active in the same Cloudflare account with no apex `A`, `AAAA`, or `CNAME` record. Don't connect Workers Builds, because it would deploy without CI's checks.

To deploy manually, run Actions → CI/CD → Run workflow on `main`. It uses the same checks, tested build, `prod` credentials, smoke test, and rollback as a merge. Local builds and previews need no Cloudflare credentials.

## Release versions

The root `package.json` owns the version of the entire deployed app, including its domain and content packages. Use stable semantic versions: patch for fixes, minor for features, major for breaking changes. There are no independent package releases.

Every PR with a non-Markdown change must increase the version above its base. Run `bun pm version patch --no-git-tag-version` at the repository root (or choose `minor` or `major`), then commit the change. Markdown-only PRs need no bump and Markdown-only pushes to `main` don't deploy. CI checks the version in the existing required checks; `RELEASE_BASE_REF=origin/main bun run release:check` runs the check locally. If another PR lands first, update your branch and bump again.

After the exact tested build deploys and production passes its smoke test, a separate job creates `v<version>` at that commit and publishes a GitHub release with generated change notes and links to production, the commit, and the Actions run. Cloudflare uses the same version tag. The deploy job retains a read-only GitHub token and the existing main-only `prod` environment; only the release job gets `contents: write`, with no Cloudflare credentials. The built-in `GITHUB_TOKEN` needs no additional secret.

Before any migration or deployment, an existing tag for a different commit blocks the run. Re-running the exact tagged commit is allowed, and publishing an existing release is a no-op. A stale or failed deployment, including one rolled back after a failed smoke test, publishes no release. Fix a failed deployment in a new PR with a higher version. Worker rollback still uses Cloudflare's immutable version ID and doesn't roll back D1 migrations or seeded content.

If release publication fails after a healthy deployment, re-run only the failed release job. Production stays deployed; the release job can recover the missing tag and release without deploying again. Releases record successful deployments; the current deployment status is in GitHub's `prod` environment and Cloudflare, including any later rollback.

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
