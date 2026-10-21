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
| `tools/secret-scan` | Dependency-free secret scanner for CI and the pre-push hook (`.githooks/pre-push`). | — |
| `apps/web/migrations` | D1 schema. The database enforces the core invariants. | — |

Dependency direction is one way: `client → shared → domain`, `worker → domain`. Business logic never imports Cloudflare, Hono, React, or Zod.

## Invariants (enforced in code or schema; keep them that way)

- **One publication per date.** `publications.publish_date` is the primary key; `publishIfAbsent` uses `INSERT … ON CONFLICT DO NOTHING` plus a read in one D1 batch (a transaction). Concurrent callers converge on the stored row. Never add an application-level "check then insert" in place of this.
- **History is permanent.** Triggers reject `UPDATE`/`DELETE` on `publications`; quotes referenced by history cannot be deleted (FK `RESTRICT`). Retire content with `enabled: false`.
- **Usage is derived, not stored.** Times published and last-published dates come from `publications` at selection time.
- **80/20 by rotation.** `ROTATION` in `domain/src/selection.ts` (4 general + 1 bible per 5 publications, random order, derived from history). Change the mix there; add a category by extending `CATEGORIES`, `ROTATION`, the `Quote` union, the schema `CHECK`, and the API contract.
- **Eastern time lives in one place:** `domain/src/publication-clock.ts`. Crons in `wrangler.jsonc` fire at 04:00 and 05:00 UTC; a test asserts they cover midnight every day.
- **HTTPS only, one hostname.** The Worker serves only the `somequote.com` Custom Domain (`workers_dev` and `preview_urls` are `false`; a test asserts it), so no alternate hostname bypasses the zone. The zone's Always Use HTTPS redirect, WAF rate limit, and www redirect exist only once `apps/web/scripts/configure-zone.ts` has been applied; change zone settings there, not in the dashboard. HSTS is sent by the app (`public/_headers` and `app.ts`, kept identical by a test), not the zone.
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
bun run lint && bun run typecheck && bun run test && bun run test:e2e   # test:e2e builds first
bun run content:verify-sources   # network: re-checks every quote against its source text
```

CI (`.github/workflows/ci.yml`) runs all of the above plus workflow linting and a check that applied migrations are unchanged; merging to `main` deploys the tested build. `secrets.yml` scans every push to any branch or tag; keep it free of path filters and cancellation, or a skipped push's commits are never scanned. `zone.yml` applies zone settings only when `configure-zone.ts` changes. Action versions are pinned to commit SHAs; actionlint is pinned with a SHA-256 checksum. Add a rule to `tools/secret-scan/src/secrets.ts` when the project starts using a new kind of credential. Workflows never get write permissions, push, or dispatch runs (`deployment-config.test.ts`), which is what keeps the automatic rollback from looping. If a build legitimately exceeds a size budget, raise it in `apps/web/scripts/check-build.ts` in the same change.

Common tasks:

- **Add or edit a quote:** edit `packages/content/src/general.ts` or `bible.ts` (add a source to `sources.ts` if new), run `bun run test` and `bun run content:verify-sources`, then `bun run db:seed:local`.
- **Change the schema:** add `apps/web/migrations/000N_*.sql` (never edit an applied migration), update `d1-quote-repository.ts` and `seed-sql.ts`.
- **Replace D1:** implement `QuoteRepository` (must guarantee one publication per date atomically) and change `repositoryFor` in `apps/web/src/worker/index.ts`.
