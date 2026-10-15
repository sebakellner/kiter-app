# Data Access

Read this guide when changing IPC, local data queries, schema, or persistence.
See [Architecture](architecture.md) for process ownership and
[Domain Model](domain-model.md) for identities and entity rules.

## Clean Foundation: Scope and Status

The database uses stable Drizzle ORM with `better-sqlite3` in a dedicated worker.
The 17-table schema, reviewed initial migration, singleton profile/Preferences
bootstrap, source imports, Favorites, and internal profile/volume operations are
implemented. Internal Author/Category commands, independent Sample/Pack assignments,
paginated queries/use inspection, and impact-checked deletion are implemented through
the worker and `DbClient`; classification IPC/UI remain pending.
Internal Collection creation/editing, bounded reads, ordered memberships,
atomic reorder and impact-checked removal also run through the worker/client.
Removal marks only unreferenced covers for cleanup; physical cleanup is pending.
Remaining organization commands, managed images, settings UI, and
player volume restoration remain planned. Persistent analysis/peaks are separate.

This foundation intentionally starts at `userData/db/kiter.sqlite`. Neither
the experimental `userData/catalog.sqlite` nor the earlier
`userData/library/library.sqlite` is opened, migrated, imported, or deleted.
Their data is development work, not a compatibility baseline. This decision
does not permit resetting a failing current database or deleting local data.
Future upgrades of the Drizzle database use its committed migration history.

## Persistence Foundation

- [DB module](../../src/main/db/index.ts) exports only `DbClient`, the asynchronous
  main-process client. It is infrastructure, not a domain entity or Library.
- [Worker](../../src/main/db/worker.ts) owns the connection and serializes
  commands. Its readiness reply follows migration, bootstrap, and validation.
  Closing rejects new commands, drains earlier writes, and awaits worker exit.
- [Connection](../../src/main/db/connection.ts) configures foreign keys and a
  5000 ms busy timeout. Native connection access stays private to DB infrastructure;
  [operations](../../src/main/db/operations) use the typed `AppDatabase`.
- [Schema](../../src/main/db/schema/index.ts) owns typed tables, checks, indexes,
  and actual foreign keys. Infer persistence types from Drizzle; do not maintain
  handwritten row interfaces beside equivalent table declarations.
- Keep domain/transfer contracts independent of Drizzle. Explicit operations map
  rows into their agreed results; neither renderer nor preload imports DB types.
- Main services own discovery, filesystem checks, authorization, and orchestration.
  No transaction waits for dialogs, traversal, audio decoding, or image processing.
- Use prepared Drizzle queries for repeated import work and transactions for
  multi-record changes. Do not add a generic repository or entity-command engine.
- Native Node/Electron rebuilds remain required. See
  [Testing Conventions](testing-conventions.md#native-database-runtime) and
  [Release Process](release-process.md).

## Migrations

[drizzle.config.ts](../../drizzle.config.ts) points to the TypeScript schema and
[drizzle](../../drizzle) output. SQL, snapshots, and the journal are committed
together. Drizzle Kit is development tooling, not a runtime dependency.

```bash
pnpm db:generate --name=describe-the-change
pnpm db:check
```

1. Change the owning schema module and directly related domain contracts.
2. Generate a migration, then review its SQL, data effects, and foreign keys.
3. Preserve `STRICT` on every created/rebuilt entity table. Drizzle 0.45 does not
   represent SQLite `STRICT` in its table declarations/snapshots; add it to newly
   generated SQL during review. Runtime verifies it. Do not edit already shipped
   migrations: add a new migration instead.
4. Test both an empty database and an existing database with pending migrations.
   Verify existing IDs, Favorites, profile, references, and rollback.
5. Commit schema, migration SQL, journal, and snapshots together. A generate run
   on an unchanged schema must report no changes.

Do not run `drizzle-kit push` against the application's database. Do not add a
CLI that silently discovers or modifies a producer's database.

[Migration application](../../src/main/db/migrate.ts) uses Drizzle's migration-file
reader and its SQL/hash/timestamp journal convention. A native immediate
transaction includes pending SQL, migration records, profile bootstrap for a
truly empty database, integrity checks, and version stamps. This small runner
is intentional: Drizzle's synchronous SQLite migrator issues its own `BEGIN`
and cannot nest in the atomic initialization transaction.

- `application_id` identifies this database format. `user_version` equals the
  number of applied migrations; `__drizzle_migrations` records each SQL hash and
  timestamp. It is infrastructure, not an eighteenth domain table.
- Existing history must be an exact prefix of the packaged history. Changed or
  missing records fail explicitly. A newer database is rejected, not downgraded.
- Migrations run with foreign keys enabled. Review SQLite table rebuilds carefully:
  toggling foreign keys inside a transaction does not disable enforcement.
  A destructive migration requires an approved data-preserving approach and
  dedicated upgrade fixtures, not blindly accepting generated SQL.
- Validation checks required strict tables, SQLite integrity/references,
  Sample/source existence, and the mandatory profile/Preferences. It does not
  manufacture replacement records for a damaged existing database.
- [Electron build](../../electron.vite.config.ts) copies committed migration assets
  beside the bundled worker. The client supplies an absolute assets location;
  runtime never relies on the current working directory. The built assets are
  included in packaging, not the development configuration.
- Missing assets, invalid formats, migration failures, corruption, and storage
  failures block readiness. Never reset, fall back to memory, or claim success.

Before releasing data-changing upgrades, establish consistent backup/recovery
and validate packaged loading on macOS and Windows. Runtime rollback is not a
replacement for backups. Recovery UI and automatic backups are not implemented.

## IPC Contracts

[Shared IPC](../../src/shared/ipc/index.ts) separates dialog/library contracts
from [results](../../src/shared/ipc/result.ts). Channels use `domain:kebab-case`;
requests with arguments use named serializable objects.

```ts
type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: AppErrorCode; message: string } }
```

- [Handlers](../../src/main/ipc) authorize sender/frame, validate unknown input,
  invoke the owning operation, and translate outcomes through `invokeResult`.
- Public codes/messages are controlled. Private DB errors map at the boundary;
  unexpected native errors use operation-specific sanitized messages. Log only
  operation and code, never raw SQL errors, producer paths, or full payloads.
- [Preload](../../src/preload/index.ts) exposes narrow methods and validates
  returned envelopes/data. It never exposes generic `invoke`, SQL, or a DB client.
- UI unwraps results at the owning workflow and presents failures. Empty success,
  dialog cancellation (`ok: true, data: null`), and failure are distinct.
- Shared types are not runtime validation. Check IDs, booleans, metadata, and
  sample authorization again before privileged work.
- Worker [protocol](../../src/main/db/protocol.ts) is private and separate from
  renderer IPC. It includes correlation, readiness, fatal, and close messages.
- Native drag stays a synchronous `send` within the original gesture. Error
  events have validated payloads and removable listeners; do not convert drag
  initiation to `invoke` or await filesystem work.

## Storage Ownership

Locations are relative to Electron's `userData`:

```text
db/
  kiter.sqlite
library/
  images/                 # Planned managed-image workflow
    <asset-uuid>.<validated-extension>
```

Source audio remains in user-selected directories. Import never copies, moves,
or modifies audio. Covers and profile avatars will share managed-image storage
and validation. Session URLs, decoded buffers, and audio bytes do not belong in
the authoritative database. Persistent analysis storage is not designed here.

## Organization Schema

The [typed schema](../../src/main/db/schema/index.ts) is the structural source
of truth; reviewed migrations are the executable history. Do not duplicate DDL
in this guide. Domain contracts, schema declarations, migration SQL, and IPC DTOs
have different responsibilities.

| Table                                         | Responsibility                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| `user_profiles`                               | Singleton local profile, name, optional Author and managed avatar; not an account.   |
| `user_preferences`                            | One typed settings record; preview volume inclusive 0–1.                             |
| `samples`                                     | UUID, presentation override, notes, Favorite, origin Pack, manual-origin protection. |
| `sample_sources`                              | One current source per Sample, canonical path, availability, observations, revision. |
| `source_roots`                                | Canonical discovery roots, registration and latest completed scan outcome.           |
| `source_root_samples`                         | Discovery associations independent of Pack membership.                               |
| `packs`                                       | Imported package, presentation data, cover and unique source-root association.       |
| `collections`                                 | User-created grouping with optional description and cover.                           |
| `collection_samples`                          | Duplicate-free Sample references with unique ordered positions.                      |
| `categories`                                  | Shared flat vocabulary, unique normalized name keys.                                 |
| `sample_categories` / `pack_categories`       | Independent direct classifications.                                                  |
| `authors` / `pack_authors` / `sample_authors` | Explicit independent credits; homonyms allowed, no roles.                            |
| `excluded_sources`                            | Library-wide canonical-location exclusions.                                          |
| `image_assets`                                | Shared managed cover/avatar metadata and cleanup state.                              |

No account User, Library, Favorite, or Pack-membership table is needed.
Do not add Kits, Tags, named favorite lists, or speculative analysis tables.

### Service-Level Invariants

- Generate UUIDs in the application. A canonical location is a lookup, not
  Sample identity; separate copies remain separate Samples. Never hash-merge.
- Create Sample/source pairs transactionally. Missing files retain records.
  Resolve privileged paths from authorized identities, not renderer input.
- Unicode names must contain non-whitespace text. Normalize Category/Author keys
  with `name.trim().normalize('NFC').toLowerCase()`, preserving accents/internal
  spaces. Rename and key updates are atomic; only Category keys are unique.
- Optional absent text is `NULL`. Presentation overrides do not rename files.
- `revision` is a monotonic analysis-invalidation token, not a content hash.
  Observed size/mtime changes advance it without changing organization.
- Availability describes a verified source check. Discovery `present` describes
  the last successful root observation, not source availability or authorization.
- Store UTC ISO 8601 observation times and controlled error codes.
- Manual origin corrections set `origin_assignment = 'manual'`, including
  standalone. Reimports cannot overwrite them; conflicting origins need review.
- Collection positions are zero-based/unique; gaps after removal are allowed.
  Packs have no manual order. Reads need deterministic ordering and bounded pages.
- Profile-linked Authors never automatically credit imports, Samples, or Packs.
- Pack minimum membership, image readiness, exclusions, profile/preferences
  existence, and confirmation are operation invariants, not FK guarantees alone.

### Commands and Atomic Boundaries (Target)

Source import, Favorite writes, profile reads, volume writes, and internal
Author/Category operations are implemented. The latter include idempotent direct
assignments on Samples/Packs, literal normalized search, bounded pages, and
transactional removal with exact-impact review tokens. `NAME_CONFLICT` identifies
duplicate Category keys; `STALE_REVIEW` requires renewed impact review. These
classification operations have no renderer IPC or UI yet. The table below describes
target behavior, including workflows still pending.

Collection commands are also implemented internally with pages of 50 (maximum
100), name/UUID ordering for Collections and position ordering for memberships.
Membership addition/removal is idempotent; re-addition appends and removal leaves
gaps. Reorder validates the entire unique current sequence, then transactionally
replaces memberships with contiguous positions, avoiding transient unique-index
collisions. Removal review hashes presentation and exact Sample IDs/positions in
bounded batches; removal rechecks inside an immediate transaction. Final cover
references become `cleanup_pending` only after checking all three reference
owners. Collection IPC/UI and physical image cleanup remain pending.

| Command                | Required behavior                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Import/rescan          | Reuse IDs, filter exclusions, create Sample/source pairs, reconcile root associations; preserve organization.                       |
| Failed scan            | Do not commit incomplete discovery; later persist a known root's failure separately. Absence alone does not prove a missing source. |
| Create/reimport Pack   | Recognize source-root association, not names; require eligible Samples and preserve manual origins.                                 |
| Change origin          | Update Pack and manual protection atomically; preserve all other organization.                                                      |
| Relink/change source   | Preserve ID, update verified source/revision, invalidate analysis; reject exclusions and occupied destinations.                     |
| Remove Pack            | Detach Samples, cascade credits/categories; retain Samples, roots, Favorites and Collections.                                       |
| Remove Collection      | Remove memberships only; schedule unused cover cleanup.                                                                             |
| Remove Sample          | Confirm, exclude its canonical location and delete metadata transactionally; keep original audio.                                   |
| Reinclude source       | Verify, clear exclusion, create a new identity; do not restore deleted annotations.                                                 |
| Unregister root        | Disable registration, retain identity/associations; re-registration reuses it.                                                      |
| Remove Category/Author | Review uses, delete associations; Author removal clears profile link, never resources/profile.                                      |
| Reorder Collection     | Validate complete unique sequence, write positions atomically; preserve order on failure.                                           |
| Edit profile           | Change name, optional Author/avatar; do not rename Authors or create credits.                                                       |
| Save Preferences       | Validate typed settings; preserve prior state on failure, including zero volume.                                                    |
| Assign credits         | Change explicit Author associations on the selected target only.                                                                    |
| Attach/replace image   | Publish validated copy, atomically register/reference it; preserve prior image on failure.                                          |

Exclusions apply across overlapping roots. Imports never clear them. No committed
source may share an excluded path. Do not use `INSERT OR REPLACE` on entities:
its deletion semantics can destroy identities or trigger cascades. Use targeted
updates and deliberate conflict handling; reverse indexes support impact review.

### Managed Image Lifecycle

Planned: accept static PNG/JPEG/WebP, inclusive **10 MiB (10,485,760 bytes)** and
**4096 pixels per axis**. Detect real content and reject animation, corruption,
oversize and unreadable files. SQL metadata is not image validation.

1. Copy to a generated temporary managed path and validate; never edit originals.
2. Publish an immutable UUID/type-derived file without overwrite. Replacements
   create new assets, not mutations of shared images.
3. Atomically register the asset and reference. Failure preserves the old image
   and requires recoverable cleanup of the unpublished/unreferenced new copy.
4. Detaching the final reference marks `cleanup_pending`. Recheck Pack/Collection
   covers and profile avatar before deleting; do not attach pending assets.
5. Delete only the validated unreferenced managed file, then its metadata.
   Failures retain retryable state and surface errors.

Filesystem and SQL do not share a transaction. Reconcile generated temporary,
published-unregistered and pending-cleanup files on restart. Prevent attachment,
publication and cleanup races. Never follow symlinks, sweep arbitrary files,
delete originals/referenced assets, or claim cleanup success prematurely.

## Implementation Order and Validation

The Drizzle/worker/IPC foundation precedes new domain features. Next, implement
bounded domain operations, explicit IPC, and corresponding UI incrementally.
Profile editing, Authors/credits, Packs/Collections, classification, exclusions,
relinking and managed images must follow their agreed rules, not generic CRUD.
Preserve current preview, waveform and authorized native dragging.

Tests cover strict schema/constraints, profile, source IDs/revisions, exclusions,
zero volume, worker draining, migration upgrades/idempotence/hash checks/rollback,
unsupported/corrupt files, and IPC envelopes/validation/redaction. Electron tests
exercise imports, failed mutations, authorization, playback and restart Favorites.
Passing development tests does not establish packaged-app or Windows support,
real DAW reception, managed-image recovery, or persistent analysis.

Future data-changing migrations need realistic upgrade fixtures and approved
backup/recovery. See [Testing Conventions](testing-conventions.md) and
[Release Process](release-process.md). Do not add classes merely because a table
exists; extend the smallest owning operation/service.

## Implemented Catalog and Favorites

The product's catalog is persisted through `DbClient`; there is no `Catalog`
domain entity or catch-all catalog service. Current UI remains folder-scoped.
Internal profile/volume operations are not exposed to settings UI or applied to
the player. Internal classification and Collection operations are available on
`DbClient`, not preload. Other entity tables await their complete operations and UI.

## Basic Rules

Keep privileged work main-owned, handlers thin, queries bounded, outcomes
explicit, and resources single-owned. Refresh views only after confirmation;
prevent stale results and duplicate mutations. Stream authorized audio rather
than returning buffers. Follow [Logging and Privacy](common-guidelines.md#logging-and-privacy).
