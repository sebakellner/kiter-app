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
the worker and `DbClient`. Category list/create/rename IPC and preload are
implemented; other classification IPC and all classification UI remain pending.
Internal Collection creation/editing, bounded reads, ordered memberships,
atomic reorder and impact-checked removal also run through the worker/client.
Removal marks only unreferenced covers for recoverable managed-image cleanup.
Internal Pack registration/reimport, presentation edits, bounded queries,
manual origins and impact-checked removal also run through the worker/client.
Sample presentation editing, paginated references/exclusions, impact-checked
catalog removal and explicit reinclusion also run through the worker/client.
Main's library service verifies reinclusion before submitting source observations.
Profile name/Author editing and image publication/reference/cleanup operations
are implemented through the worker/client. Profile updates preserve the avatar
and Preferences and reject missing Authors. A main-only image service validates
copies, publishes immutable files, and reconciles interrupted work at startup.
Sample/Pack IPC/UI, remaining organization commands, image/profile UI, settings
UI, and player volume restoration remain planned. Persistent analysis/peaks are
separate.

This foundation intentionally starts at `userData/db/kiter.sqlite`. Neither
the experimental `userData/catalog.sqlite` nor the earlier
`userData/library/library.sqlite` is opened, migrated, imported, or deleted.
Their data is development work, not a compatibility baseline. This decision
does not permit resetting a failing current database or deleting local data.
Future upgrades of the Drizzle database use its committed migration history.

## Persistence Foundation

- [DB module](../../src/main/db/index.ts) exports only `DbClient`, the asynchronous
  main-process client. It is infrastructure, not a domain entity or Library.
- [Worker](../../src/main/db/worker/entry.ts) owns the connection and serializes
  commands. Its readiness reply follows migration, bootstrap, and validation.
  Closing rejects new commands, drains earlier writes, and awaits worker exit.
- [Connection](../../src/main/db/runtime/connection.ts) configures foreign keys and a
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

## DB Module Organization

- `client.ts` owns the explicit asynchronous `DbClient` facade. The private
  `client/worker-transport.ts` owns worker creation, correlation, response
  validation, readiness, failure propagation, and draining shutdown.
- `worker/entry.ts` owns startup and the message/error boundary. Domain
  dispatchers under `worker/dispatch/` adapt validated protocol messages to
  operations; they do not own queries or business rules.
- `protocol/` owns private worker messages and their runtime validation.
  `messages.ts` composes the domain protocols and lifecycle envelopes.
- `runtime/` owns the native connection, initialization, and migration runner.
  `schema/` remains the typed persistence model.
- Group operations under `operations/<domain>/`. Keep small cohesive operations
  together; extract substantial queries, mutations, and workflows into named
  files such as `queries.ts`, `memberships.ts`, `import.ts`, and `removal.ts`.
  Use kebab-case for multiword filenames and direct internal imports rather
  than barrels or a generic repository/CRUD framework.
- Operations depend on shared domain validation, schema, and DB infrastructure,
  never on worker protocol validators. Cross-domain helpers stay with their
  owner, such as asset reference checks. `internal/` holds genuinely reused
  DB-only mechanics, not a catch-all domain utility layer.
- The complete persistence workflow owns its transaction, including exact-impact
  revalidation. Never split an atomic operation into multiple client requests.
  Review hashing helpers must preserve serialization and association ordering.
- Shared pure pagination contracts and validation live in
  `src/shared/domain/pagination.ts`; protocol-specific validation stays private.

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

[Migration application](../../src/main/db/runtime/migrate.ts) uses Drizzle's migration-file
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

Before releasing data-changing upgrades, deliver the agreed
[Backup and Recovery](features/backup-recovery.md) contracts and validate packaged
loading on macOS and Windows. Runtime rollback is not a replacement for backups.
Recovery UI and automatic backups are not implemented.

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
- Worker [protocol](../../src/main/db/protocol/messages.ts) is private and separate from
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
  images/                 # Shared managed covers and avatars
    <asset-uuid>.<validated-extension>
```

Source audio remains in user-selected directories. Import never copies, moves,
or modifies audio. Covers and profile avatars share managed-image storage
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
classification operations expose only Category list/create/rename through IPC and
preload; there is no classification UI yet. The table below describes
target behavior, including workflows still pending.

Collection commands are also implemented internally with pages of 50 (maximum
100), name/UUID ordering for Collections and position ordering for memberships.
Membership addition/removal is idempotent; re-addition appends and removal leaves
gaps. Reorder validates the entire unique current sequence, then transactionally
replaces memberships with contiguous positions, avoiding transient unique-index
collisions. Removal review hashes presentation and exact Sample IDs/positions in
bounded batches; removal rechecks inside an immediate transaction. Final cover
references become `cleanup_pending` only after checking all three reference
owners. Collection IPC/UI remain pending; main performs recoverable image cleanup.

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

Sample lifecycle commands are implemented internally without schema changes.
Removal hashes presentation, source observations and exact reference identities
(including Collection positions) in batches of 500 and rechecks inside an
immediate transaction. Exclusion and cascaded metadata deletion commit together;
the filesystem is untouched. Reference/exclusion lists default to 50, maximum 100. Main verifies explicit reinclusion against a registered root, checks readable
canonical audio without symlinks, then the worker rechecks containment, exclusion
and vacancy and creates a new manually standalone Sample/source pair. No deleted
organization is recovered. These APIs neither publish audio URLs nor authorize
playback/dragging; their IPC/UI remain pending.

Pack registration is separate from discovery. `prepareLibraryPackImport` scans
and imports Samples, then obtains the root and review through `DbClient`.
Confirmation requires the token and exactly one keep/assign decision per
conflicting Sample, rechecking scan, Pack and candidate source/origin state in an
immediate transaction. Manual standalone corrections are protected; reimport
preserves presentation. Removal reviews exact origins and classification/credit
IDs, detaches Samples with manual standalone protection and schedules unused
cover cleanup. Queries are bounded; review hashing uses batches of 500. These
internal APIs do not authorize audio access. No schema migration is needed.

### Managed Image Lifecycle

Implemented internally: accept static PNG/JPEG/WebP, inclusive **10 MiB (10,485,760 bytes)** and
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

`ManagedImages` serializes filesystem workflows; the application holds a
single-instance lock and drains image work before closing the DB worker.
`sharp` validates real format, dimensions, static content and full decoding.
Selected files are read with a bounded buffer; source and managed links are
rejected. Publication fsyncs a UUID `.tmp` copy, then uses an exclusive same-folder
hard link to publish without overwrite. Registering metadata and changing the
reference share a DB transaction. References compare `expectedAssetId`, returning
`STALE_REVIEW` on concurrent replacement. Failed DB publication leaves a generated
orphan for reconciliation; the original reference is preserved.

Cleanup claims recheck all three reference owners in an immediate transaction
and mark unused assets pending. Pending assets cannot be attached, including
during filesystem deletion. Missing files complete cleanup idempotently;
failures retain metadata for retry. Startup processes DB assets in UUID-keyset
pages of 100 and streams generated directory entries, removing only recognized
unregistered UUID copies/temps. Unknown entries are left alone; recognized links
and directories report failures and are not deleted. Missing referenced copies
are reported without removing their references. Recovery returns per-asset errors
and startup presents a retry message. Image IPC, selection and display UI remain
pending; this internal API does not authorize renderer-supplied paths.

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
real DAW reception, packaged managed-image loading, or persistent analysis.

Future data-changing migrations need realistic upgrade fixtures and approved
backup/recovery. See [Testing Conventions](testing-conventions.md) and
[Release Process](release-process.md). Do not add classes merely because a table
exists; extend the smallest owning operation/service.

## Implemented Catalog and Favorites

The product's catalog is persisted through `DbClient`; there is no `Catalog`
domain entity or catch-all catalog service. Current UI remains folder-scoped.
Internal profile/volume operations are not exposed to settings UI or applied to
the player. Category list/create/rename are available through preload; remaining
classification, Collection and Pack operations are internal to `DbClient`.
Other entity tables await their complete operations and UI.

## Basic Rules

Keep privileged work main-owned, handlers thin, queries bounded, outcomes
explicit, and resources single-owned. Refresh views only after confirmation;
prevent stale results and duplicate mutations. Stream authorized audio rather
than returning buffers. Follow [Logging and Privacy](common-guidelines.md#logging-and-privacy).
