# Data Access

Read this guide when changing IPC, local data queries, or persistence.
See [Architecture](architecture.md) for process boundaries and
[Domain Model](domain-model.md) for identities and data integrity.

## Current Foundation

Kiter uses typed preload methods and main-process services for local files.
There is no persistent catalog, HTTP backend, ORM, or query framework yet.
The current [shared API](../../src/shared/ipc.ts) describes session-scoped access.

## Basic Rules

- Keep filesystem and future catalog access in main-process services. Renderer
  features consume explicit preload methods, not arbitrary paths or queries.
- Validate callers and inputs at privileged boundaries. Shared TypeScript types
  do not replace runtime validation or sample authorization.
- Keep handlers thin and contracts serializable. Stream audio through the
  authorized protocol rather than sending large buffers over IPC.
- Surface meaningful failures; a failed query must not become an empty result.
  Progress subscriptions must be removable and stale results must be ignored.
- Follow [Logging and Privacy](common-guidelines.md#logging-and-privacy) for
  diagnostics. Do not log raw requests, catalog records, or filesystem errors
  containing personal paths.
- When mutations are introduced, refresh affected views only after their actual
  outcome is known. Preserve consistency after partial failures.
- When persistence is introduced, keep stable IDs separate from paths and use
  domain-specific queries with bounded results and deterministic ordering.
- Choose storage, migrations, and recovery policies when persistence is scoped.
  Do not introduce a database or generic repository framework from this guide.
