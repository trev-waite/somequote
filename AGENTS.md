# AGENTS.md

SomeQuote publishes one quote a day, the same for everyone, revealed word by word above a writer's desk that counts down to the next one. It is a single Cloudflare Worker serving a React app, a JSON API, and a daily cron, backed by D1, with the domain and curated content as separate packages.

Favor sound engineering judgment over rigid rules, and see below for the software engineering principles.

Start with the [README](README.md) for setup, commands, and workflows. Read the standard that fits the change:

- [Architecture](doc/standards/architecture.md): domain modeling, module boundaries, dependency direction, and when an abstraction is earned.
- [Engineering Principles](doc/standards/engineering-principles.md): designing from first principles, simplicity, cohesion, and removing what an old design left behind.
- [Working Approach](doc/standards/working-approach.md): understanding before changing, solving root causes, and keeping changes focused.
- [Quality & Verification](doc/standards/quality-and-verification.md): testing behavior, validating at the right scope, and reporting what was not verified.

Consult deeper documentation only when the task warrants it, rather than loading everything for every change.

## Boundaries

- Never expose secrets, credentials, or sensitive data.
- Do not add code comments unless the context is absolutely necessary and the code cannot fully explain the reason for it.
- Clean up unused code and unneeded additional docs after all code changes
- Organize for findability: group related files in folders named by feature or layer, give each distinct set of content or concern its own clearly named file where appropriate.
