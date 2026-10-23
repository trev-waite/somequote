# SomeQuote

One quote a day, the same for everyone. A quote reveals itself word by word, and a writer's desk below it has a lamp and a clock counting down to the next quote.

- About 80% enduring quotes from writers, philosophers, scientists, and leaders; about 20% verses from the World English Bible.
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
| `bun run db:migrate:local` / `db:seed:local` | Apply migrations / upsert the collection into the local database |
| `bun run hooks:install` / `scan:secrets` | Enables the pre-push secret scan (once per clone) / scans the whole history |
| `bun run audit:dependencies` | Fails on any vulnerability that upgrading a direct dependency would fix, and on any critical one |

Before opening a PR, run `bun run lint && bun run typecheck && bun run test && bun run test:e2e`. Install the Playwright browsers once with `cd apps/web && bunx playwright install chromium webkit`.

## Layout

```
packages/domain         quote model · publication clock · selection · ensurePublication · history · QuoteRepository contract
packages/content        curated quotes and provenance · editorial rules · source verification
apps/web                the deployable Worker
  src/worker            entry: wires D1 into the API (fetch) and the cron (scheduled)
    api                 Hono routes · rate limiting · response caching · DTO mapping · errors
    db                  D1QuoteRepository · seed SQL
  src/shared            HTTP contract (Zod mini), used by the Worker and the client
  src/client            React app shell · styles
    data                API client · loading and caching today's publication
    publication         the quote view · reveal timing · sharing · countdown
    desk                the interactive desk; one folder per object (book, bottle, drawer, envelope, magnifier)
  migrations            D1 schema; constraints and triggers enforce the invariants
tools/secret-scan       dependency-free credential scanner for CI and the pre-push hook
tools/dependency-audit  CI check for fixable or critical dependency vulnerabilities
```

## Content

Every quote comes from a US public-domain text or the World English Bible, and `content:verify-sources` checks it against that source. Verse text is never edited. To add a quote, edit `packages/content/src`, then run `bun run test` and `bun run content:verify-sources`. To retire one, set `enabled: false`, because published history keeps it.

## Documentation

The code, its types, and its module boundaries are the primary documentation.

- [doc/api.md](doc/api.md): calling the public API, its responses, errors, and limits.
- [doc/operations.md](doc/operations.md): deploying, zone setup, credentials, account limits.
- [AGENTS.md](AGENTS.md): how agents and contributors work here, linking the standards in [doc/standards/](doc/standards/) for architecture, engineering principles, working approach, and verification.
