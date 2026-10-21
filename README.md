# SomeQuote

One quote a day, the same for everyone. A quote reveals itself word by word; scroll to a writer's desk with a lamp that switches the color scheme and a clock counting down to the next quote.

- About 80% enduring quotes from writers, philosophers, scientists, and leaders, and about 20% verses from the World English Bible.
- A new quote at midnight in New York (`America/New_York`), published once and kept in a permanent history.
- One Cloudflare Worker: React app as static assets, a small JSON API, and a daily cron, backed by D1.

## Quick start

Requirements: [Bun](https://bun.sh) 1.4+, and `unzip` for the optional source verification. No Cloudflare account is needed for local development.

```bash
bun install
bun run db:migrate:local    # create the local D1 database (.wrangler/state)
bun run db:seed:local       # load the curated collection (idempotent)
bun run dev                 # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `bun run dev` | Vite dev server running the Worker in `workerd`, with local D1 |
| `bun run build` | Production build of the client assets and Worker (`apps/web/dist`), then the public-asset allowlist and size budgets |
| `bun run test:e2e` | Builds, then runs the Playwright smoke tests against `vite preview` of the build |
| `bun run preview` | Serves the production build locally, including `_headers` |
| `bun run lint` / `bun run format` | Biome check / fix |
| `bun run typecheck` | TypeScript for every package; fails if generated Worker types are stale |
| `bun run test` | Vitest: domain, content, Worker (real local D1), and client suites |
| `bun run db:migrate:local` | Applies `apps/web/migrations` to the local database |
| `bun run db:seed:local` | Upserts the collection into the local database |
| `bun run content:verify-sources` | Downloads every cited source text and checks each quote against it |

Trigger the daily job locally while `bun run dev` is running:

```bash
curl "http://localhost:5173/cdn-cgi/local/scheduled?cron=0+4+*+*+*"
```

## Architecture

```
packages/domain    quote model · publication clock · selection policy · ensurePublication · QuoteRepository contract
packages/content   curated quotes + provenance · editorial rules · source verification script
apps/web           the deployable Worker
  src/worker       fetch (Hono API) + scheduled (cron) · D1QuoteRepository · seed SQL
  src/shared       HTTP contract (Zod mini), used by Worker and client
  src/client       React app · reveal timing · styles
  migrations       D1 schema (constraints and triggers enforce the invariants)
```

The domain package is plain TypeScript with no dependencies; everything platform-specific sits at the edges. See [AGENTS.md](AGENTS.md) for module ownership, invariants, and conventions.

**Request flow.** `GET /` is served from static assets without invoking the Worker. The page requests `GET /api/quote/today`; its browser reuses a fresh HTTP response when available. Requests reaching the Worker pass an IP rate limit, then look in Cloudflare's shared Cache API. On a cache miss, the Worker computes today's Eastern date and calls `ensurePublication`, which returns the stored publication or selects and records one. The cron does the same at midnight, so the first visitor of the day normally reads an existing row. Shared cache hits skip D1 entirely.

### API

| Endpoint | Response |
| --- | --- |
| `GET /api/quote/today` | `{ date, quote }`. `quote` is `{ category: 'general', id, text, author, source }` or `{ category: 'bible', id, text, reference, translation }` |
| `GET /api/quotes/history?limit=10&before=YYYY-MM-DD` | `{ items: [{ date, quote }], nextBefore }`. Newest first, up to today; `limit` is 1–30 (default 10); pass `nextBefore` as `before` for the next page |

Errors are `{ error: { code, message } }` with `invalid_request` (400), `not_found` (404), `rate_limited` (429, with `Retry-After: 60`), `no_quote_available` (503), or `internal_error` (500, details are only logged). Successful responses are cached until the next Eastern midnight, at most one hour; errors are `no-store`. There are no write endpoints and no CORS grant. This is a public API; CORS does not prevent scripts or other servers from calling it.

### Free-tier operation and abuse protection

- **Browser cache.** The frontend uses the browser's HTTP cache; there is no separate local-storage copy. `Cache-Control`, `Date`, and `Expires` bound freshness to one hour or the next New York midnight, whichever comes first.
- **Shared cache.** The Worker uses Cloudflare's Cache API, local to each Cloudflare data center. Keys include the Eastern publication date and normalized endpoint parameters. Extra query parameters cannot force database reads; equivalent history queries share a key. Cache hits reduce the browser TTL by the response's age, so repeated hits cannot extend its expiry. Cache failures fall back to D1; errors are never cached.
- **IP limit.** `API_RATE_LIMITER` in `wrangler.jsonc` targets 60 API requests per 60 seconds per IP, shared across all API paths and checked before cache or database access. Only Cloudflare's `CF-Connecting-IP` is used; missing addresses share an `unknown` bucket. Cloudflare's counters are approximate and local to a data center, not a global quota. Shared office or mobile-network IPs also share the allowance. Namespace `1001` is reserved for this app; change it if another Worker in your account already uses it.
- **Request budget.** Cloudflare currently includes [100,000 Worker requests per day](https://developers.cloudflare.com/workers/platform/limits/) on the Workers Free plan, shared across the account and reset at midnight UTC. Static-asset requests do not invoke this Worker. Cache hits and requests rejected inside the Worker still consume its request allowance. D1 Free includes [5 million rows read and 100,000 rows written per day](https://developers.cloudflare.com/d1/platform/pricing/). Free-plan quota exhaustion causes failures rather than automatic paid overages; keep the account on Free if a hard zero-cost ceiling is required. A distributed attack can still exhaust these limits.
- **Edge rate limit.** `scripts/configure-zone.ts` adds a zone rate limiting rule that blocks API bursts before they invoke the Worker (see Deploying). Monitor Worker requests, D1 row usage, and 429s in Cloudflare; thresholds may need adjustment for legitimate traffic.

### Daily selection

`selectQuote` in `packages/domain/src/selection.ts`, from history alone:

1. **Category.** Publications are grouped in rotations of five. Each rotation holds exactly four general quotes and one Bible verse, and the verse's position is random, so the mix of what is actually published stays at 80/20 with no fixed pattern. If a category has no enabled quotes, its slot goes to the other category; the next rotation starts fresh instead of catching up with a run of verses.
2. **Quote.** Within the category: the fewest times published, then the longest since last published, then random. Nothing repeats until every enabled quote in its category has appeared.

**Atomicity.** D1 has no interactive transactions, so publishing is a single batch: `INSERT … SELECT … WHERE enabled = 1 ON CONFLICT (publish_date) DO NOTHING`, then a read of the date's row. The primary key on `publish_date` guarantees one winner when requests race; losers return the winner's publication. Retries and repeated cron runs converge on the same row. Triggers make history permanent.

**Time.** All date logic is in `publication-clock.ts`. Cron triggers run in UTC, and midnight in New York is 04:00 UTC in daylight time and 05:00 UTC in standard time, so both fire daily. The one that isn't midnight finds today already published (or ensures the previous day, which is still current in New York).

## Content

`packages/content` holds 192 quotes: 150 general quotes and 42 verses (about 78/22; the published mix is held at 80/20 by the rotation).

- **Sources.** Every general quote cites a primary text (Project Gutenberg plain text or Wikisource) with a locator such as a book, chapter, or letter. `bun run content:verify-sources` downloads each text and checks the wording. It last verified all 192 quotes against 60 source texts. Quotes differ from their sources only typographically (curly quotes, dashes, line breaks, a capitalized first letter or a final period on an excerpt).
- **Avoided misattributions.** Popular versions that do not match their sources were replaced with the authentic text. For example, Thoreau's "advances confidently in the direction of his dreams", Keller's "nothing can be done without hope" (no "and confidence"), Tolstoy's "patience and time", and Goethe's "a little song" (not "music").
- **Licensing.** General quotes come from works in the public domain in the United States (published before 1931, including the translations used: Long, Legge, Müller, Gummere, Jowett, Chase, Hapgood, Maude, Carlyle, and the Kelloggs). Some translators and authors died less than 70 years ago, so a few texts may still be under copyright in other jurisdictions; they appear here as short, attributed quotations. Verses are exact excerpts of the [World English Bible](https://worldenglish.bible) (public domain; "World English Bible" is a trademark of eBible.org, and excerpts are never altered so the name stays accurate).
- **Seeding.** `bun run db:seed:local` upserts every quote by id and disables quotes removed from the collection. History is never touched, and a quote's category cannot change.

To add a quote, edit `general.ts` or `bible.ts`, then run `bun run test`, `bun run content:verify-sources`, and `bun run db:seed:local`.

## Design

- **Typography.** The quote is set in **Instrument Serif**, the typeface Trevor's Knight site uses for its name in the primary theme. The WOFF2 is a byte-identical copy, self-hosted with its SIL Open Font License (`apps/web/public/fonts`). Secondary text uses the system UI font. Spacing and line heights sit on an 8px grid; the quote size steps with its length and the viewport.
- **Presentation.** The featured text is enclosed in typographic quotation marks, followed by its attribution. The publication date is kept in the API and history, and is not displayed on the page.
- **Reveal.** Words rise 8px and unblur from 6px over 650ms, each 80ms after the last (tightened for long quotes so the final word starts within 2.4s). The attribution uses the same blur, duration, and easing, starting one stagger after the final word starts. Completed text releases its animation filters. Timing lives in `src/client/reveal.ts`. The page waits for both the quote and the font before revealing. Screen readers get the full text once; reduced motion uses a single opacity fade.
- **Desk.** Scrolling snaps between the quote and an isometric desk with an open book, a lamp, and a flip clock. The lamp switches modes when clicked or when its cord is pulled; taps give the cord a smooth tug, and a mouse can brush it aside. The clock counts down to the next Eastern midnight using the domain publication clock, including 23- and 25-hour days, and refreshes the quote when it expires. Reduced motion disables scene and clock animations.
- **Color.** `#FFFFFF` and `#000000`, reversed in dark mode. The page initially follows the system preference and remembers a manual choice. A script applies it before first paint; the document background and browser theme color stay in sync for Safari's toolbars.

## Deploying to Cloudflare

These steps create resources in your account; none have been run.

```bash
cd apps/web
bunx wrangler login
bunx wrangler d1 create somequote
```

1. Copy the printed `database_id` into the `d1_databases` entry in `apps/web/wrangler.jsonc`. If you skip this, `wrangler deploy` can provision the database automatically, but you would then have to run the migration and seed after the first deploy, and the API returns errors until you do.
2. Create the schema and load the content:
   ```bash
   bun run db:migrate:remote
   bun run db:seed:remote
   ```
3. Build and deploy. `somequote.com` must already be a zone in the same account, with no existing apex `A`/`AAAA`/`CNAME` record; deploying attaches it as the Worker's [Custom Domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) and creates its DNS record and certificate. `workers_dev` and `preview_urls` are `false` in `wrangler.jsonc`, so the Worker has no `*.workers.dev` hostnames that would bypass the zone's HTTPS redirect and WAF rule.
   ```bash
   bun run deploy
   ```
4. Configure the zone. Create an API token scoped to `somequote.com` with Zone Read, Zone Settings Edit, Zone WAF Edit, Single Redirect Edit, and DNS Edit (all limited to `somequote.com`), then review the plan and apply it:
   ```bash
   CLOUDFLARE_API_TOKEN=… bun run --cwd apps/web zone:plan    # read-only; prints what would change
   CLOUDFLARE_API_TOKEN=… bun run --cwd apps/web zone:apply
   ```
   `scripts/configure-zone.ts` is idempotent and touches only the settings it lists and the rules it owns (matched by `ref`). It reads and checks everything before writing anything: if a check fails (SSL off, another rate limiting rule already exists, or a DNS-only `www` record), it exits with the fix and changes nothing. It sets:
   - **HTTPS only.** Always Use HTTPS (every `http://` request is redirected at the edge, before assets or the Worker), Automatic HTTPS Rewrites, minimum TLS 1.2, TLS 1.3 without 0-RTT (early data can be replayed), and HTTP/3. The app sends `Strict-Transport-Security: max-age=63072000; includeSubDomains` on every response (`public/_headers`, `src/worker/app.ts`), so the zone's HSTS header is kept off to avoid a second, conflicting header.
   - **Rate limiting rule.** Path starts with `/api/`, 30 requests per 10 seconds per IP in each Cloudflare data center (not a global count), Block for 10 seconds (the Free plan's one rule, 10-second period, and 10-second timeout). It blocks bursts before Worker invocation; the in-Worker minute limit remains a second layer. If you created a rate limiting rule by hand earlier, the script asks you to delete it first: the Free plan allows only one.
   - **www.** A proxied placeholder `AAAA www → 100::` and a 301 redirect rule from `www.somequote.com` to `https://somequote.com`, keeping path and query. The redirect runs at the edge and never invokes the Worker.
   - **HTML untouched.** Email Obfuscation and Rocket Loader off: both rewrite pages and inject scripts that the Content-Security-Policy blocks. Browser Integrity Check stays on. Don't enable Cloudflare Web Analytics' automatic injection for the same reason.
   - **DNSSEC.** Enabled; the script prints the DS record to add at your registrar (automatic with Cloudflare Registrar).
5. Verify on the real domain: `http://somequote.com` and `https://www.somequote.com/?a=1` redirect to `https://somequote.com/` (query kept), the site and `https://somequote.com/api/quote/today` load, a short burst of API requests is blocked, and both cron triggers appear in the Worker's Settings → Triggers. Logs and traces are enabled in `wrangler.jsonc`.

HSTS preload is deliberately not enabled. Submitting `somequote.com` to [hstspreload.org](https://hstspreload.org) requires adding `; preload` to both HSTS headers, is slow to undo, and makes every subdomain HTTPS-only in browsers permanently. Add it once the domain is settled.

After the first deploy, deployments are automatic (below): merging to `main` applies new migrations, syncs the collection, and deploys.

## Continuous deployment

Three workflows in `.github/workflows`:

**`ci.yml`, on every pull request and every merge to `main`.** Docs-only changes (`*.md`) are skipped, and a new push to a PR cancels its previous run.

| Job | Checks |
| --- | --- |
| Lint, typecheck, test | Applied migrations unchanged (only new `000N_*.sql` files); [actionlint](https://github.com/rhysd/actionlint) and shellcheck on the workflows; `biome ci`; typecheck; every Vitest suite. PRs also run `bun audit` (high and critical), and `content:verify-sources` when `packages/content` changes (source texts are cached by `sources.ts`). |
| Build and browser smoke tests | Production build; `scripts/check-build.ts` (only expected files become public assets, `.assetsignore` keeps `wrangler.json` and `.dev.vars` private, and JS/CSS stay within gzip budgets); Playwright in Chromium at desktop and mobile sizes against `vite preview` of that build with a migrated, seeded local D1 (today's quote renders with the production headers and font, with no console errors, CSP violations, or failed requests; no horizontal overflow; the lamp's color scheme survives a reload; bundles are immutable). |
| Deploy (merges to `main` only) | Skips a commit that is no longer the head of `main`, so re-running an old workflow can't roll production back. Downloads the build the jobs above tested, applies D1 migrations, syncs the collection (`db:seed:remote`), deploys with the commit as the version message and tag, then smoke-tests `https://somequote.com` (`scripts/smoke.ts`: page, bundle, and API contract with the production headers). If the smoke test fails, it rolls the Worker back once to the version that was live before, then reports whether production recovered. Migrations stay applied, which is safe because they are append-only. Deploys run one at a time. |

**The rollback can't loop.**
- It runs at most once per run, and nothing after it deploys.
- No workflow can start another run: the token is read-only (`contents: read`), and no step pushes, dispatches, or calls `gh workflow run`. GitHub also never starts workflows from events caused by the job's own token, except dispatches.
- `wrangler rollback` is a Cloudflare API call that triggers nothing in GitHub.
- A later deploy needs a new merge or a manual run.

`deployment-config.test.ts` fails if a workflow gains write permissions, a push or dispatch, or a second deploy or rollback. Don't also connect the repository to Cloudflare Workers Builds, which would deploy every push separately, without these checks.

The two check jobs run in parallel. Each installs from the frozen lockfile in seconds, so there is no dependency or Turbo cache to maintain. Merges rerun the checks on the merged result rather than trusting the PR run, since `main` may have moved.

**`zone.yml`, not on every merge.** Zone settings change rarely and need a different, more powerful token, so this workflow runs `scripts/configure-zone.ts`:
- **Applies it** when the script (or the workflow) changes on `main`.
- **Runs it on demand** from Actions → Zone settings → Run workflow, which prints the plan, or applies it if you tick *Apply*.
- **Checks weekly (Mondays, read-only)** that nobody has changed the zone in the dashboard (`--check` fails on drift), and that `http://` and `www` still redirect.

After applying, it verifies the HTTPS and `www` redirects at the edge.

**`secrets.yml`, on every push to any branch or tag.** It has no path filters and is never cancelled. A skipped push would never be scanned, because the next run scans only the commits after it. Pull requests are covered by the pushes to their branches.

**Secret scanning.** `tools/secret-scan` has no dependencies and is covered by its own tests.
- **What it checks:** every added line of every new commit, so a secret deleted in a later commit is still caught. It also checks commit messages and the message of a pushed annotated tag. It reports the commit that first added each secret.
- **What it matches:**
  - Cloudflare's prefixed `cfut_`/`cfat_`/`cfk_`/`cfast_` credentials anywhere.
  - Legacy Global API Keys after `X-Auth-Key`, and Origin CA keys.
  - Unprefixed legacy tokens assigned to a secret-looking name, including quoted passphrases, JSON, and YAML `|` blocks.
  - `Bearer` tokens and `user:password@` URLs.
  - GitHub, Anthropic, OpenAI, xAI, Google, AWS, and npm keys; PEM, OpenSSH, PGP, and PuTTY private keys; JWTs.
  - Committed `.env`, `.envrc`, `.dev.vars`, and key files. `.example`, `.sample`, and `.template` copies are allowed.
- **What it ignores:** `${{ secrets.X }}`, `$VAR`, `process.env.X`, placeholders, checksums, and lockfile hashes.
- **Robustness:** it pins git's diff format, so a developer's `diff.noprefix`, path quoting, or binary-file settings can't hide a file. Files git calls binary are read as text, and paths with quotes, tabs, or non-ASCII characters are reported correctly. Every pattern is bounded, so a 200 KB minified line takes milliseconds.
- **Running it yourself:** run `bun run hooks:install` once per clone. A pre-push hook then runs the same scan before anything leaves your machine, which CI cannot do. `bun run scan:secrets` scans the whole history.
- **Deliberate test values:** mark the line `secret-scan: allow`, or assemble the value at runtime as the tests do.

If a real credential is found, rotate it first; it has left your machine if it was pushed.

**Setup.** Add three repository secrets (Settings → Secrets and variables → Actions). Create the two tokens as **Account API tokens** (Manage Account → Account API Tokens). Cloudflare recommends them for CI/CD, since they don't depend on a person's login, and Wrangler needs them for permissions this narrow. Give each a TTL (12 months, say), and note the renewal date.

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Your account ID (dashboard → Workers & Pages → Account details) |
| `CLOUDFLARE_DEPLOY_TOKEN` | Account → Workers Scripts → Edit; Account → D1 → Edit; Account → Account Settings → Read; Zone → Workers Routes → Edit, for `somequote.com` only |
| `CLOUDFLARE_ZONE_TOKEN` | Zone → Zone → Read; Zone → Zone Settings → Edit; Zone → Zone WAF → Edit; Zone → Single Redirect → Edit; Zone → DNS → Edit; all for `somequote.com` only |

Cloudflare's compatibility list for account tokens doesn't explicitly mention Workers Custom Domains or DNSSEC. If the first deploy or zone run gets an authentication error on those calls, create that token as a user token instead. IP address filtering isn't practical, because GitHub-hosted runners use changing addresses.

The deploy job fails with instructions until those secrets and the `database_id` exist. The weekly drift check stays quiet until `CLOUDFLARE_ZONE_TOKEN` is set.

**Limits of a private repository on GitHub Free.** Branch protection, required checks, and environment secrets need GitHub Pro (or a public repository):
- Nothing stops a merge while checks are red; wait for the checks before merging. The deploy job won't run unless they pass.
- Repository secrets are readable by workflows on any branch of this repository, but not from forks. Keep the two Cloudflare tokens narrowly scoped, and give write access only to people you'd trust with them.

**Where the secrets live.** GitHub repository secrets are the right default here. They are encrypted, masked in logs, and withheld from forks.
- **GitHub Pro ($4/month) is the one upgrade worth making.**
  - Move the Cloudflare secrets into a `production` environment restricted to `main`, so a workflow on any other branch can't read them. Add `environment: production` to the deploy and zone jobs.
  - Protect `main`, requiring *Lint, typecheck, test*, *Build and browser smoke tests*, and *Secret scan*.
  - Required reviewers on private repositories still need GitHub Enterprise.
- **A public repository** gets all of that free, plus required reviewers and GitHub's own secret scanning with push protection.
- **Short-lived credentials (GitHub OIDC)** would beat any stored token, but Cloudflare's API doesn't document support for GitHub OIDC. Revisit if that changes.
- **External secret managers** (1Password, Doppler, Vault) still need a bootstrap secret stored in GitHub, and add another party with access. Using AWS Secrets Manager through GitHub OIDC with a `main`-only trust policy would restrict access by branch without Pro, but it means running an AWS account for two tokens.

## Verification

Run `bun run lint && bun run typecheck && bun run test && bun run test:e2e` before opening a PR (`test:e2e` builds, then runs the Playwright smoke tests; install the browser once with `cd apps/web && bunx playwright install chromium --only-shell`). CI runs the same checks. The tests cover real local D1 contention, publication history, selection distribution, DST, shared API caching and expiry, IP throttling, API failures, reveal timing/accessibility, cord gestures, clock animation cleanup, and countdown rollover. `bun run content:verify-sources` checks all 192 quotes against 60 primary texts; add `--refresh` to download the sources again instead of using the local cache.

The production preview was checked in the browser at desktop and mobile sizes, including font loading, overflow, word/attribution sequencing, and console errors. No Cloudflare resources were created, no account authentication was performed, and nothing was deployed. Production bindings and deployment remain to be verified after connecting your account.

## Replacing parts

- **Storage.** Implement `QuoteRepository` from `@somequote/domain` and return it from `repositoryFor` in `apps/web/src/worker/index.ts`. The one hard requirement is an atomic "insert unless the date exists".
- **Selection.** `selectQuote` is a pure function over a `SelectionSnapshot`; change the mix with `ROTATION` or replace the function.
- **API.** `createApp` in `apps/web/src/worker/app.ts` is a Hono app built from injected dependencies (repository, clock, random), and the contract in `src/shared/api-contract.ts` is what the client depends on.
- **Content.** Any collection that satisfies `findContentProblems` can be seeded.
