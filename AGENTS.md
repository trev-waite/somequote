# AGENTS.md

Working standards for agents in this repository, condensed from Lauren Tan's pstack skills. The code, its types, and its module boundaries are the documentation. Start with the README.

## Approach

- Do the least that solves the problem. Prefer deleting code to adding it, and the smallest change to a broad one.
- Settle callers, types, and module boundaries before implementing. If the design proves wrong, redesign instead of patching.
- Trace each symptom to the first place the system went wrong, and fix it there.
- Migrate every caller and delete the old API in the same change. Don't leave compatibility layers.
- Fix a repeated mistake at the highest layer. Try architecture first, then types and lint, then tests. Prose rules come last.
- Proceed on reversible work and report the result. Stop and confirm before anything irreversible.
- Keep changes scoped to the request. Don't refactor, rename, or reformat unrelated code.

## Code

- Make illegal states unrepresentable. Use discriminated unions with exhaustive `switch` statements and no `default`.
- Brand semantic primitives, and narrow values with guards instead of type assertions.
- Treat external data as unknown and parse it at the boundary. Trust types inside, and keep business logic in pure functions.
- Minimize reader load. Collapse wrappers with one caller, keep state in the narrowest scope, and derive values instead of syncing them.
- Make operations idempotent so retries and concurrent callers converge.
- Keep code comments to a minimum. Write one only for a constraint the code cannot express, and encode everything else as a type, check, test, or lint.
- Use the repository's formatter and linter. Never edit a migration that has been applied; add a new one.

## Verification

- Prove it works against the real artifact. Run it, read the actual value, and inspect the diff. "It compiles" is not done.
- Test behavior through public interfaces with literal expected values. Test guarantees that live in a dependency, such as the database, against the real dependency instead of a mock.
- Explain a performance number before reporting it. Identify the limiter, match the conditions, and repeat the run.
- Run the checks listed in the README. Label claims as measured, inferred, or guessed, and say which checks you could not run.

## Writing

- Use one idea per sentence, active voice, and plain words. Every sentence should be a concrete instruction, fact, or number.
- Cut filler, hedging, praise, and AI vocabulary. Use periods or commas instead of em dashes.
- Use sentence-case headings, no decorative emoji, and bold only where it adds information.
- Docs state what is true now, never status or history. The `doc/` folder holds at most three files, limited to external setup, operations, and policy that code cannot express.
- Keep the README to an overview, quick start, commands, and links. Don't create new documentation files unless asked.

## Keeping this file generic

Only generic preferences belong here. Paths, identifiers, commands, and changing facts go in the code or `doc/`.
