# Content policy

Editorial and licensing rules the validators cannot check.

## Sources

- Every general quote cites a primary text (Project Gutenberg or Wikisource) or a film scene with English captions, with a locator.
- Use the authentic text. Replace popular misquotations rather than repeating them.
- `bun run content:verify-sources` downloads each source and checks the wording (network required; `--refresh` re-downloads).

## Licensing

- Literary quotes come from works in the US public domain (published before 1931, including the translations used). A few translators died less than 70 years ago, so some texts may be under copyright elsewhere; they appear as short, attributed quotations.
- Film entries are brief excerpts from copyrighted films, credited to the fictional speaker and the film's title and year, not the actor.
- Verses are exact excerpts of the [World English Bible](https://worldenglish.bible). "World English Bible" is an eBible.org trademark that may not name altered text, so verse text is never edited.
- The quote font ships with its SIL Open Font License beside it in `apps/web/public/fonts`.

## Adding a quote

Edit `packages/content/src/general.ts` or `bible.ts`, adding any new source to `sources.ts`. Then run `bun run test`, `bun run content:verify-sources`, and `bun run db:seed:local`. Retire a quote with `enabled: false`; published history cannot be deleted.
