# AGENTS.md

SomeQuote publishes one quote per day (America/New_York) that every visitor sees. One Cloudflare Worker serves the React app (static assets), a two-endpoint JSON API, and a daily cron. See [README.md](README.md) for setup and deployment.

## Map

| Path | Owns | Depends on |
| --- | --- | --- |
| `packages/domain` | Quote model, publication clock (Eastern dates, DST), selection policy, `ensurePublication`, the `QuoteRepository` contract. Pure TypeScript, no runtime dependencies. | nothing |
| `packages/content` | The curated collection, per-quote provenance, editorial rules (`findContentProblems`), and `verify-sources` (checks every quote against its primary text). | domain |
| `apps/web/src/worker` | Worker entry (`fetch` + `scheduled`), Hono API (`app.ts`), D1 implementation of `QuoteRepository`, seed SQL. | domain, shared |
| `apps/web/src/shared` | HTTP contract (Zod mini schemas) used by both Worker and client. | domain |
| `apps/web/src/client` | React app: data loading (`today.ts`), reveal timing (`reveal.ts`), presentation (`Publication.tsx`), styles. | shared |
| `apps/web/migrations` | D1 schema. The database enforces the core invariants. | — |

Dependency direction is one way: `client → shared → domain`, `worker → domain`. Business logic never imports Cloudflare, Hono, React, or Zod.

## Invariants (enforced in code or schema; keep them that way)

- **One publication per date.** `publications.publish_date` is the primary key; `publishIfAbsent` uses `INSERT … ON CONFLICT DO NOTHING` plus a read in one D1 batch (a transaction). Concurrent callers converge on the stored row. Never add an application-level "check then insert" in place of this.
- **History is permanent.** Triggers reject `UPDATE`/`DELETE` on `publications`; quotes referenced by history cannot be deleted (FK `RESTRICT`). Retire content with `enabled: false`.
- **Usage is derived, not stored.** Times published and last-published dates come from `publications` at selection time.
- **80/20 by rotation.** `ROTATION` in `domain/src/selection.ts` (4 general + 1 bible per 5 publications, random order, derived from history). Change the mix there; add a category by extending `CATEGORIES`, `ROTATION`, the `Quote` union, the schema `CHECK`, and the API contract.
- **Eastern time lives in one place:** `domain/src/publication-clock.ts`. Crons in `wrangler.jsonc` fire at 04:00 and 05:00 UTC; a test asserts they cover midnight every day.
- **WEB verses are exact excerpts.** Do not edit verse text (the WEB license forbids calling altered text the WEB). General quotes may differ from sources only typographically (see `content/scripts/verify-sources.ts`).
- **Every quote character must exist in the font.** `SUPPORTED_CHARACTERS` in `content/src/validate.ts`.

## Conventions

- Validate at boundaries (D1 rows, HTTP query, API responses on the client, content); trust types inside. Brand semantic strings (`QuoteId`, `PublicationDate`) via guards, never `as`.
- Discriminated unions on `category` / `kind`; exhaustive `switch` without `default`.
- Doc comments only for contracts and non-obvious constraints. No narration comments.
- Tests assert behavior through public interfaces. Database guarantees are tested against real local D1 (workerd), not mocks.
- Formatting and linting: Biome (`bun run format`). Single quotes, 2 spaces, 100 columns.
- After changing bindings in `wrangler.jsonc`, run `bun run --cwd apps/web types` and commit `worker-configuration.d.ts`.

## Verify

```bash
bun run lint && bun run typecheck && bun run test && bun run build
bun run content:verify-sources   # network: re-checks every quote against its source text
```

Common tasks:

- **Add or edit a quote:** edit `packages/content/src/general.ts` or `bible.ts` (add a source to `sources.ts` if new), run `bun run test` and `bun run content:verify-sources`, then `bun run db:seed:local`.
- **Change the schema:** add `apps/web/migrations/000N_*.sql` (never edit an applied migration), update `d1-quote-repository.ts` and `seed-sql.ts`.
- **Replace D1:** implement `QuoteRepository` (must guarantee one publication per date atomically) and change `repositoryFor` in `apps/web/src/worker/index.ts`.
