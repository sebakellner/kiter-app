# Data Access

Read this guide when changing IPC, local data queries, or persistence.
See [Architecture](architecture.md) for process boundaries and
[Domain Model](domain-model.md) for identities and data integrity.

## Current Foundation

Kiter uses typed preload methods and main-process services for local files and
a persistent SQLite catalog. There is no HTTP backend, ORM, or query framework.
The [shared API](../../src/shared/ipc.ts) separates durable sample IDs from
session-scoped audio URLs.

## Implemented Catalog and Favorites

- [Catalog](../../src/main/services/catalog/index.ts) owns one worker and asynchronous
  `importFolder`, `setFavorite`, and `close` operations. The
  [worker](../../src/main/services/catalog/catalogWorker.ts) owns the synchronous
  [SQLite store](../../src/main/services/catalog/catalogStore.ts), so database work does
  not block Electron's main thread.
- Storage is `catalog.sqlite` under Electron's `userData`, not an audio folder.
  Built-in `node:sqlite` is experimental in the current Electron runtime; no
  database dependency or native addon is added.
- Schema v1 has `roots`, `samples`, and `root_samples`. Unique canonical paths
  and transactional imports preserve UUIDs/favorites across rescans and
  overlapping roots. Missing root associations are retained as unavailable.
  A failed scan does not commit an incomplete catalog observation.
- The first identity policy is exact canonical location, not content matching.
  External moves create new records; same-location replacement is not detected.
  See [Domain Model](domain-model.md#implemented-identity-policy).
- Favorite writes validate the main-window frame, ID membership in the active
  folder, and a boolean value before invoking the worker. UI reflects only
  acknowledged writes, disables duplicate actions, and shows recoverable errors.
- Favorites persist globally, but the UI filters only the current folder.
  No global favorites query, named lists, automatic folder restore, or relink
  operation exists.
- Schema initialization is transactional and uses `PRAGMA user_version`.
  The store separates connection configuration from schema initialization.
  Schema version and the 5,000 ms lock timeout are named implementation
  constants; invalid version values are distinguished from incompatible schemas.
  Unsupported schemas, corruption, and storage failures are explicit errors;
  do not reset the catalog or fall back to a session-only successful write.
  There are no upgrade migrations or automatic backups yet. Before a future
  schema upgrade, define backup, rollback, and recovery.
- Quit waits for database closure and worker exit. For a manual backup, fully
  quit Kiter and copy the database, preserving any SQLite companion files.
  Never delete the catalog to bypass an error without explicit user approval.

## Approved Persistence Direction (Planned)

Keep SQLite as the authoritative local catalog and replace the experimental
`node:sqlite` driver with `better-sqlite3` before expanding the schema. This is
an approved direction, not an implemented dependency or validated release
claim.

- Retain the catalog worker and asynchronous domain-specific service API.
  The replacement driver's synchronous database work must remain off the
  Electron main thread.
- Treat driver replacement and domain-schema expansion as separate steps.
  The driver transition must open the existing schema v1 catalog and preserve
  Sample UUIDs, Favorites, roots, and associations. Do not recreate the
  database, reset user data, or combine this step with speculative new tables.
- Select a compatible driver version during implementation. Account for the
  native addon, pnpm build permissions, Electron rebuilding, and unpacking
  native files from the packaged application.
- Validate both plain Node tests and the Electron runtime; a binary built for
  one runtime is not evidence that the other can load it. Validate packaged
  worker loading and persistence on macOS and Windows before claiming support.
- Define backup and recovery before the transition. Preserve transactional
  writes, explicit schema/storage failures, and orderly connection shutdown.
  Driver selection alone does not establish stability or recovery guarantees.

The [driver documentation](https://github.com/WiseLibs/better-sqlite3) describes
its synchronous API and worker support; its
[installation guidance](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/troubleshooting.md)
documents Electron rebuilding and native-library unpacking requirements.
Follow [Testing Conventions](testing-conventions.md) and
[Release Process](release-process.md) for validation and platform claims.

After the driver transition, derive schema changes from the agreed
[logical data profiles](domain-model.md#logical-data-profiles), domain
relationships, removal/exclusion rules, and actual query requirements.
Define migrations, foreign keys, uniqueness constraints, membership ordering,
and indexes without assuming one entity must equal one table. Schema design,
cover storage, and persistent analysis/cache layout remain pending.

## Basic Rules

- Keep filesystem and future catalog access in main-process services. Renderer
  features consume explicit preload methods, not arbitrary paths or queries.
- Validate callers and inputs at privileged boundaries. Shared TypeScript types
  do not replace runtime validation or sample authorization.
  Apply consistent window and main-frame validation to all privileged channels,
  including dialogs and native gestures. Keep cancellation distinct from an
  unexpected missing result.
- Keep handlers thin and contracts serializable. Stream audio through the
  authorized protocol rather than sending large buffers over IPC.
- Surface meaningful failures; a failed query must not become an empty result.
  Progress subscriptions must be removable and stale results must be ignored.
- Follow [Logging and Privacy](common-guidelines.md#logging-and-privacy) for
  diagnostics. Do not log raw requests, catalog records, or filesystem errors
  containing personal paths.
- Refresh affected views only after their actual
  outcome is known. Preserve consistency after partial failures.
- Keep stable IDs separate from paths and use
  domain-specific queries with bounded results and deterministic ordering.
- Scope migrations and recovery policies before adding further persistent data.
  Do not introduce a generic repository framework from this guide.
