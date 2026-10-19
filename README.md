# SomeQuote

One quote a day, the same for everyone. A white page, one beautifully set quote that reveals itself word by word, and its attribution.

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
| `bun run build` | Production build of the client assets and Worker (`apps/web/dist`) |
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

**Request flow.** `GET /` is served from static assets without invoking the Worker. The page requests `GET /api/quote/today`; the Worker computes today's Eastern date and calls `ensurePublication`, which returns the stored publication or selects and records one. The cron does the same at midnight, so the first visitor of the day normally reads an existing row.

### API

| Endpoint | Response |
| --- | --- |
| `GET /api/quote/today` | `{ date, quote }`. `quote` is `{ category: 'general', id, text, author, source }` or `{ category: 'bible', id, text, reference, translation }` |
| `GET /api/quotes/history?limit=10&before=YYYY-MM-DD` | `{ items: [{ date, quote }], nextBefore }`. Newest first, up to today; `limit` is 1–30 (default 10); pass `nextBefore` as `before` for the next page |

Errors are `{ error: { code, message } }` with `invalid_request` (400), `not_found` (404), `no_quote_available` (503), or `internal_error` (500, details are only logged). Successful responses may be cached until the next Eastern midnight, at most one hour; errors are `no-store`. There are no write endpoints and no CORS.

### Daily selection

`selectQuote` in `packages/domain/src/selection.ts`, from history alone:

1. **Category.** Publications are grouped in rotations of five. Each rotation holds exactly four general quotes and one Bible verse, and the verse's position is random, so the mix of what is actually published stays at 80/20 with no fixed pattern. If a category has no enabled quotes, its slot goes to the other category; the next rotation starts fresh instead of catching up with a run of verses.
2. **Quote.** Within the category: the fewest times published, then the longest since last published, then random. Nothing repeats until every enabled quote in its category has appeared.

**Atomicity.** D1 has no interactive transactions, so publishing is a single batch: `INSERT … SELECT … WHERE enabled = 1 ON CONFLICT (publish_date) DO NOTHING`, then a read of the date's row. The primary key on `publish_date` guarantees one winner when requests race; losers return the winner's publication. Retries and repeated cron runs converge on the same row. Triggers make history permanent.

**Time.** All date logic is in `publication-clock.ts`. Cron triggers run in UTC, and midnight in New York is 04:00 UTC in daylight time and 05:00 UTC in standard time, so both fire daily. The one that isn't midnight finds today already published (or ensures the previous day, which is still current in New York).

## Content

`packages/content` holds 142 quotes: 110 general quotes and 32 verses (about 78/22; the published mix is held at 80/20 by the rotation).

- **Sources.** Every general quote cites a primary text (Project Gutenberg plain text or Wikisource) with a locator such as a book, chapter, or letter. `bun run content:verify-sources` downloads each text and checks the wording. It last verified all 142 quotes against 60 source texts. Quotes differ from their sources only typographically (curly quotes, dashes, line breaks, a capitalized first letter or a final period on an excerpt).
- **Avoided misattributions.** Popular versions that do not match their sources were replaced with the authentic text. For example, Thoreau's "advances confidently in the direction of his dreams", Keller's "nothing can be done without hope" (no "and confidence"), Tolstoy's "patience and time", and Goethe's "a little song" (not "music").
- **Licensing.** General quotes come from works in the public domain in the United States (published before 1931, including the translations used: Long, Legge, Müller, Gummere, Jowett, Chase, Hapgood, Maude, Carlyle, and the Kelloggs). Some translators and authors died less than 70 years ago, so a few texts may still be under copyright in other jurisdictions; they appear here as short, attributed quotations. Verses are exact excerpts of the [World English Bible](https://worldenglish.bible) (public domain; "World English Bible" is a trademark of eBible.org, and excerpts are never altered so the name stays accurate).
- **Seeding.** `bun run db:seed:local` upserts every quote by id and disables quotes removed from the collection. History is never touched, and a quote's category cannot change.

To add a quote, edit `general.ts` or `bible.ts`, then run `bun run test`, `bun run content:verify-sources`, and `bun run db:seed:local`.

## Design

- **Typography.** The quote is set in **Instrument Serif**, the typeface Trevor's Knight site uses for its name in the primary theme. The WOFF2 is a byte-identical copy, self-hosted with its SIL Open Font License (`apps/web/public/fonts`). Secondary text uses the system UI font. Spacing and line heights sit on an 8px grid; the quote size steps with its length and the viewport.
- **Reveal.** Words rise 8px and fade in over 400ms, each 80ms after the last (tightened for long quotes so the cascade stays under 2.4s). The attribution fades in over 450ms once the last word has finished. Timing lives in `src/client/reveal.ts`. The page waits for both the quote and the font before revealing, so words are laid out once in their final face. Screen readers get the full text once; with `prefers-reduced-motion`, nothing moves and the quote simply fades in.
- **Color.** `#FFFFFF` and `#000000`, reversed in dark mode (system preference). Gray is used only for the date and attribution.

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
3. Build and deploy:
   ```bash
   bun run deploy
   ```
4. Check `https://somequote.<your-subdomain>.workers.dev/api/quote/today`. In the dashboard, the Worker's Settings → Triggers lists both cron triggers. Logs and traces are enabled in `wrangler.jsonc`.
5. Optional: add a custom domain under the Worker's Settings → Domains & Routes, or in `wrangler.jsonc`.

Later content changes need only `bun run db:seed:remote`; schema changes need a new migration and `bun run db:migrate:remote` before deploying.

## Verification

Verified locally on October 18, 2026: frozen-lockfile Bun install, migrations and idempotent seeding, lint, typechecking (including generated Worker types), all 105 tests, and the production build. The tests include real local D1 contention, publication history, selection distribution, DST, API failures, and reveal timing/accessibility. Source verification matched all 142 quotes against 60 primary texts.

The production preview was checked in the browser at desktop and mobile sizes, including font loading, overflow, word/attribution sequencing, and console errors. No Cloudflare resources were created, no account authentication was performed, and nothing was deployed. Production bindings and deployment remain to be verified after connecting your account.

## Replacing parts

- **Storage.** Implement `QuoteRepository` from `@somequote/domain` and return it from `repositoryFor` in `apps/web/src/worker/index.ts`. The one hard requirement is an atomic "insert unless the date exists".
- **Selection.** `selectQuote` is a pure function over a `SelectionSnapshot`; change the mix with `ROTATION` or replace the function.
- **API.** `createApp` in `apps/web/src/worker/app.ts` is a Hono app built from injected dependencies (repository, clock, random), and the contract in `src/shared/api-contract.ts` is what the client depends on.
- **Content.** Any collection that satisfies `findContentProblems` can be seeded.
