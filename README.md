# SomeQuote

One quote a day, the same for everyone. A quote reveals itself word by word, and a writer's desk below it has a lamp and a clock counting down to the next quote.

- About 80% enduring quotes from writers, philosophers, scientists, leaders, and athletes; about 20% verses from the World English Bible.
- A new quote at midnight in New York, published once and kept in a permanent history.
- One Cloudflare Worker serving the React app as static assets, a JSON API, and a daily cron, backed by D1.

## Quick start

Requires [Bun](https://bun.sh) 1.4+. Source verification also needs `unzip`. No Cloudflare account is needed for local development.

```bash
bun install
bun run db:migrate:local    # create the local D1 database (.wrangler/state)
bun run db:seed:local       # load the curated collection (idempotent)
bun run dev                 # http://localhost:5173
```

Trigger the daily job locally while `bun run dev` is running:

```bash
curl "http://localhost:5173/cdn-cgi/local/scheduled?cron=0+4+*+*+*"
```

## Commands

| Command | What it does |
| --- | --- |
| `bun run dev` | Vite dev server running the Worker in `workerd`, with local D1 |
| `bun run build` | Production build in `apps/web/dist`, with CSP hashes and size budgets |
| `bun run preview` | Serves the production build locally |
| `bun run test` | Vitest across every package, including the Worker against real local D1 |
| `bun run test:e2e` | Builds, then runs the Playwright tests against the preview |
| `bun run benchmark:browser` | Builds, then measures startup and interaction timing in Chromium and WebKit |
| `bun run lint` / `bun run format` | Biome check / fix |
| `bun run typecheck` | TypeScript for every package |
| `bun run content:verify-sources` | Downloads every cited source and checks each quote against it |
| `bun run content:verify-attributions` | Checks every quote’s Grokipedia link reaches an article |
| `bun run db:migrate:local` / `db:seed:local` | Apply migrations / upsert the collection into the local database |
| `bun run hooks:install` / `scan:secrets` | Enables the pre-push secret scan (once per clone) / scans the whole history |
| `bun run audit:dependencies` | Fails on any vulnerability that upgrading a direct dependency would fix, and on any critical one |
| `bun run release:check` | Validates the app's release version and rejects tag collisions |

Before opening a PR, run `bun run lint && bun run typecheck && bun run test && bun run test:e2e`. Install the Playwright browsers once with `cd apps/web && bunx playwright install chromium webkit`.

PRs with non-Markdown changes must increase the root app version; see [release versions](doc/operations.md#release-versions).

## Layout

```
packages/domain         quote model · publication clock · selection; /publication: ensurePublication · history · QuoteRepository contract · typed errors (Effect)
packages/content        curated quotes and provenance · editorial rules · source verification
apps/web                the deployable Worker
  src/worker            entry: wires D1 into the API (fetch) and the cron (scheduled) · structured logging
    api                 Hono routes · rate limiting · response caching · DTO mapping · error responses
    db                  D1QuoteRepository · seed SQL
  src/shared            HTTP contract (Zod mini), used by the Worker and the client
  src/client            React app shell · styles
    data                API client · loading and caching today's publication
    publication         the quote view · reveal timing · sharing · countdown
    desk                the interactive desk; one folder per object (book, bottle, drawer, envelope, magnifier)
  migrations            D1 schema; constraints and triggers enforce the invariants
tools/secret-scan       dependency-free credential scanner for CI and the pre-push hook
tools/dependency-audit  CI check for fixable or critical dependency vulnerabilities
tools/release           reviewed app version and release-tag checks
```

## Content

Almost every quote comes from a US public-domain text or the World English Bible, and `content:verify-sources` checks it against that source. A few well-known sayings by sports figures and racing drivers have no such text; these live in `packages/content/src/quotes/sports.ts`, are `attested` with where they were said and the year, and need manual review. Verse text is never edited.

To add a quote:

1. Edit the lists in `packages/content/src/quotes`.
2. Add the author’s Grokipedia article URL to `packages/content/src/attributions.ts` if it is not already listed. For Bible passages, use the article about the cited book. Open the link and confirm the article is about the intended person or entity; do not guess the URL from the displayed name. Reuse the existing mapping for repeat authors or books.
3. Run `bun run test`, `bun run content:verify-sources`, and `bun run content:verify-attributions`. Tests require a curated link for every quote; the live link check verifies that each URL reaches a Grokipedia article. Confirming the article’s identity remains part of editorial review.

To retire a quote, set `enabled: false`, because published history keeps it. Keep its attribution link for historical publications.

## Documentation

The code, its types, and its module boundaries are the primary documentation.

- [doc/api.md](doc/api.md): calling the public API, its responses, errors, and limits.
- [doc/operations.md](doc/operations.md): deploying, zone setup, credentials, account limits.
- [AGENTS.md](AGENTS.md): how agents and contributors work here, linking the standards in [doc/standards/](doc/standards/) for architecture, engineering principles, working approach, and verification.
