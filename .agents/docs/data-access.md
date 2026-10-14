# Data Access

Read this guide when changing IPC, local data queries, or persistence.
See [Architecture](architecture.md) for process boundaries and
[Domain Model](domain-model.md) for identities and data integrity.

## Clean Foundation: Scope and Status

The new entity system starts from a fresh SQLite database using
`better-sqlite3`. The existing `node:sqlite` catalog is a development prototype,
not a compatibility baseline. Do not design a driver-only transition, import
its records, preserve its IDs, or implement an upgrade from its schema.

This guide is a design, not implemented persistence. Existing code and database
files remain unchanged until the replacement is explicitly implemented.
Starting fresh does not authorize automatically deleting the prototype or
silently resetting a failing new database.

The first delivery includes one UserProfile and its Preferences, Samples,
Packs, Collections, Categories, Authors, independent Sample/Pack credits,
sample Favorites, source registration, exclusions, and managed images.
Persistent technical analysis and waveform peaks are a separate delivery.
Do not remove working preview or waveform behavior merely because their
persistence is deferred.

## Approved Persistence Direction (Planned)

- SQLite is the authoritative local catalog. Use `better-sqlite3` from the
  beginning of the new implementation; no HTTP backend, ORM, generic entity
  engine, or generic repository framework is required.
- One catalog worker owns the connection and serializes database operations.
  Its synchronous SQL must not block Electron's main thread.
- Main-process services own filesystem access, authorization, and coordination.
  Renderer and preload consume specific typed operations, not SQL or arbitrary
  filesystem access.
- Configure foreign keys and a bounded lock timeout on every connection.
  Use prepared statements and explicit transactions for multi-record commands.
- Select the driver version during implementation and validate its native addon
  in both plain Node tests and Electron. Account for pnpm build permissions,
  Electron rebuilding, and native-library unpacking.
- Validate restart persistence and packaged worker loading on macOS and Windows.
  A successful Node test or development build is not packaged-app evidence.

See the [driver documentation](https://github.com/WiseLibs/better-sqlite3),
[Electron installation guidance](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/troubleshooting.md),
[Testing Conventions](testing-conventions.md), and
[Release Process](release-process.md).

## Storage Ownership

Proposed paths are relative to Electron's `userData`, never hardcoded user
directories:

```text
library/
  library.sqlite
  images/
    <asset-uuid>.<validated-extension>
```

- Source audio stays in user-selected directories. Import never copies, moves,
  or modifies audio. Audio centralization is a separate future operation.
- The new database has a distinct path from the prototype's `catalog.sqlite`.
  It is intentionally a new catalog, not a fallback after an old one fails.
- Covers and profile avatars share managed image storage and validation, without
  modifying originals. No separate avatar-copy/cache subsystem is required.
  Temporary copies used during validation belong to that same managed scope.
- Session authorization URLs, decoded buffers, and audio bytes do not belong
  in the catalog. Persistent analysis storage is not designed here.

## Proposed Organization Schema (Not Implemented)

### Entities Versus Source Observations

A Sample UUID identifies the catalog resource. Its canonical path is a unique
lookup for the current source, not its identity. Store user organization in
`samples` and mutable source observations in the one-to-one `sample_sources`
record. Create and remove both within a transaction.

The same canonical location resolves to the existing Sample. Separate physical
copies remain separate Samples even when their contents match. In-app moves
and confirmed relinking preserve the UUID; hashes never silently merge records.

| Table | Responsibility |
| --- | --- |
| `user_profiles` | Exactly one local profile with required name, optional Author link, and optional managed avatar; not an account. |
| `user_preferences` | One typed settings record per profile; initially preview volume only. |
| `samples` | Sample identity, presentation-name override, notes, Favorite mark, origin Pack, and manual-origin protection. |
| `sample_sources` | One current source per Sample: canonical path, availability, observations, and revision token. |
| `source_roots` | Registered canonical discovery directories and latest completed scan outcome. |
| `source_root_samples` | Many-to-many discovery associations, independent of Pack membership. |
| `packs` | Imported package identity, name, description, optional cover, and unique source-root association for reimport. |
| `collections` | User-created identity, name, optional description and cover. |
| `collection_samples` | Unique Sample references and explicit ordering within a Collection. |
| `categories` | Shared flat vocabulary with unique normalized names. |
| `sample_categories` / `pack_categories` | Independent direct classification assignments. |
| `authors` / `pack_authors` / `sample_authors` | Reusable declared credits; Sample/Pack assignments are independent, homonyms allowed, and roles omitted. |
| `excluded_sources` | Library-wide exclusions of canonical locations, independent of deleted Samples and roots. |
| `image_assets` | Shared validated image copies for covers and profile avatars, with cleanup state; not external image paths. |

No account User, Library, Favorite, or Pack-membership table is needed.
UserProfile does not introduce login, multiple profiles, or per-user catalog
ownership. No Kits, Tags, named favorite lists, or speculative analysis tables
enter this schema.

### SQL Target

This DDL describes initialization of an empty new catalog only. Runtime must
first distinguish an empty database from an existing supported, unsupported,
or invalid database; never run initialization as a repair/reset.

`application_id` identifies the new catalog format. `user_version` starts at
1 for this new system and tracks future delivered changes; this is unrelated
to the prototype's version number.

```sql
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

BEGIN IMMEDIATE;

CREATE TABLE source_roots (
  id TEXT PRIMARY KEY,
  canonical_path TEXT NOT NULL UNIQUE,
  registered INTEGER NOT NULL DEFAULT 1 CHECK (registered IN (0, 1)),
  last_scan_at TEXT,
  last_scan_outcome TEXT CHECK (last_scan_outcome IN ('completed', 'failed')),
  last_scan_error_code TEXT,
  CHECK ((last_scan_at IS NULL) = (last_scan_outcome IS NULL)),
  CHECK (
    (last_scan_outcome IS NOT NULL AND last_scan_outcome = 'failed'
      AND last_scan_error_code IS NOT NULL AND length(last_scan_error_code) > 0)
    OR
    (last_scan_error_code IS NULL
      AND (last_scan_outcome IS NULL OR last_scan_outcome = 'completed'))
  )
) STRICT;

CREATE TABLE image_assets (
  id TEXT PRIMARY KEY,
  storage_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 4096),
  height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 4096),
  state TEXT NOT NULL DEFAULT 'ready' CHECK (state IN ('ready', 'cleanup_pending')),
  CHECK (
    (mime_type = 'image/png' AND storage_key = id || '.png')
    OR (mime_type = 'image/jpeg' AND storage_key = id || '.jpg')
    OR (mime_type = 'image/webp' AND storage_key = id || '.webp')
  )
) STRICT;

CREATE TABLE packs (
  id TEXT PRIMARY KEY,
  source_root_id TEXT NOT NULL UNIQUE REFERENCES source_roots(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description TEXT,
  cover_asset_id TEXT REFERENCES image_assets(id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE samples (
  id TEXT PRIMARY KEY,
  display_name TEXT CHECK (display_name IS NULL OR length(trim(display_name)) > 0),
  notes TEXT,
  favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
  pack_id TEXT REFERENCES packs(id) ON DELETE SET NULL,
  origin_assignment TEXT NOT NULL DEFAULT 'automatic'
    CHECK (origin_assignment IN ('automatic', 'manual'))
) STRICT;

CREATE TABLE sample_sources (
  sample_id TEXT PRIMARY KEY REFERENCES samples(id) ON DELETE CASCADE,
  canonical_path TEXT NOT NULL UNIQUE,
  availability TEXT NOT NULL CHECK (availability IN ('available', 'missing', 'inaccessible')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  observed_size_bytes INTEGER CHECK (observed_size_bytes >= 0),
  observed_mtime_ms REAL,
  last_checked_at TEXT NOT NULL,
  last_error_code TEXT,
  CHECK (
    (availability = 'available' AND last_error_code IS NULL)
    OR (availability IN ('missing', 'inaccessible')
      AND last_error_code IS NOT NULL AND length(last_error_code) > 0)
  )
) STRICT;

CREATE TABLE source_root_samples (
  source_root_id TEXT NOT NULL REFERENCES source_roots(id) ON DELETE RESTRICT,
  sample_id TEXT NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
  present INTEGER NOT NULL CHECK (present IN (0, 1)),
  PRIMARY KEY (source_root_id, sample_id)
) STRICT;

CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description TEXT,
  cover_asset_id TEXT REFERENCES image_assets(id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE collection_samples (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  sample_id TEXT NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (collection_id, sample_id),
  UNIQUE (collection_id, position)
) STRICT;

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  name_key TEXT NOT NULL UNIQUE CHECK (length(name_key) > 0)
) STRICT;

CREATE TABLE sample_categories (
  sample_id TEXT NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (sample_id, category_id)
) STRICT;

CREATE TABLE pack_categories (
  pack_id TEXT NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (pack_id, category_id)
) STRICT;

CREATE TABLE authors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  name_key TEXT NOT NULL CHECK (length(name_key) > 0)
) STRICT;

CREATE TABLE user_profiles (
  id TEXT PRIMARY KEY,
  singleton INTEGER NOT NULL DEFAULT 1 UNIQUE CHECK (singleton = 1),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  avatar_asset_id TEXT REFERENCES image_assets(id) ON DELETE RESTRICT,
  author_id TEXT REFERENCES authors(id) ON DELETE SET NULL
) STRICT;

CREATE TABLE user_preferences (
  profile_id TEXT PRIMARY KEY REFERENCES user_profiles(id) ON DELETE CASCADE,
  preview_volume REAL NOT NULL DEFAULT 1.0 CHECK (preview_volume BETWEEN 0 AND 1)
) STRICT;

CREATE TABLE pack_authors (
  pack_id TEXT NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  PRIMARY KEY (pack_id, author_id)
) STRICT;

CREATE TABLE sample_authors (
  sample_id TEXT NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  PRIMARY KEY (sample_id, author_id)
) STRICT;

CREATE TABLE excluded_sources (
  canonical_path TEXT PRIMARY KEY
) STRICT;

CREATE INDEX samples_by_pack ON samples(pack_id, id);
CREATE INDEX favorite_samples ON samples(id) WHERE favorite = 1;
CREATE INDEX roots_by_sample ON source_root_samples(sample_id, source_root_id);
CREATE INDEX collections_by_sample ON collection_samples(sample_id, collection_id);
CREATE INDEX samples_by_category ON sample_categories(category_id, sample_id);
CREATE INDEX packs_by_category ON pack_categories(category_id, pack_id);
CREATE INDEX packs_by_author ON pack_authors(author_id, pack_id);
CREATE INDEX samples_by_author ON sample_authors(author_id, sample_id);
CREATE INDEX authors_by_name_key ON authors(name_key, id);
CREATE INDEX packs_by_cover ON packs(cover_asset_id);
CREATE INDEX collections_by_cover ON collections(cover_asset_id);

PRAGMA application_id = 0x4B495452;
PRAGMA user_version = 1;

COMMIT;
```

### Representation and Invariants

- The singleton constraint allows at most one UserProfile; the service ensures
  exactly one profile and one preference record exist before exposing the
  Library. Fresh initialization inserts both with an application-generated
  UUID, initial name `Local profile`, no avatar or Author link, and volume 1.
  Include bootstrap records in the initialization transaction; the DDL above
  defines structure, not those runtime-bound inserts.
  On reopening a catalog, missing required profile/preference records are
  explicit integrity errors, not permission to manufacture replacement defaults.
- The beta supports profile edits, not profile creation/deletion or account
  authorization. Library entities do not need `user_id` fields. A profile link
  never creates credits or changes the linked Author's name.
- Preview volume is a finite numeric value from 0 to 1, inclusive, not a
  percentage string. Restore it before playback and preserve zero; persist
  acknowledged writes and surface storage errors. No theme or mute preference
  is added. Extend settings with typed columns when behavior is approved.
- Generate UUIDs in the application. Resolve paths from authorized IDs; never
  trust renderer-supplied paths, normalized name keys, asset keys, or revision
  tokens. Canonical paths use exact matching, not Category normalization.
- Derive actual filenames from source paths with platform-aware helpers.
  A presentation override never renames audio; absent optional text is `NULL`.
  Enforce Unicode-aware non-whitespace names in the service because SQLite's
  `trim` check does not cover all whitespace.
- Generate Category and Author keys with
  `name.trim().normalize('NFC').toLowerCase()`. Preserve accents and internal
  spaces. Update names and keys atomically; Category collisions are errors,
  while Author matches offer reuse without automatic merging.
- Every committed Sample must have one source record. The primary key prevents
  multiple sources per Sample; the service enforces the required existence
  through transactional creation. A missing file retains that record.
- `revision` is a monotonic invalidation token, not a content hash. Increment
  when a source change is observed or a relink is confirmed. Preserve user
  organization and invalidate derived results for the old revision.
  Size/mtime observations are change signals, not proof of identical content;
  stronger analysis-version validation is defined with the analysis module.
- Availability describes the latest source check, not codec support or an
  authorization capability. Store UTC ISO 8601 check/scan times and sanitized
  bounded error codes, never raw filesystem errors.
- Discovery `present` is the last successful root observation. It does not
  replace source availability, define Pack membership, or authorize playback.
- Manual origin changes set `origin_assignment = 'manual'`, even when the
  Pack becomes `NULL`. Rescans never overwrite these corrections. Assigning
  an already-owned Sample to a different Pack requires explicit review.
- Collection positions are zero-based and unique; gaps are permitted after
  removal. Packs have no manual order. Reads need deterministic sorting and
  bounded pagination; path indexes do not implement natural sorting.
- Direct Sample credits do not inherit from Packs or profile identity. Author
  removal cascades both credit relationships and clears the optional profile
  link, without deleting the profile, Preferences, Samples, or Packs.
- Asset filenames are derived from validated UUIDs and detected image types.
  Verify real static image content, dimensions, size, and managed-directory
  containment; database metadata alone is not image validation.
- Pack creation with at least one Sample, Sample/source existence, exclusion
  consistency, image readiness, profile/preference existence, and user confirmation are service invariants,
  not guarantees supplied by foreign keys alone.

### Commands and Atomic Boundaries

Discovery, image validation, and user review happen before database write
transactions. Revalidate affected records inside each transaction. No database
transaction waits for a dialog, directory traversal, or audio/image decoding.

| Command | Catalog behavior |
| --- | --- |
| Import/rescan | Reuse registered canonical sources, filter exclusions, create new Sample/source pairs, reconcile discovery associations, and record success. Preserve user fields and reviewed origin decisions. |
| Failed scan | Record a known root's failure separately; never commit incomplete discovery or mark all previous sources missing. Update source availability only from actual source checks. |
| Create/reimport Pack | Recognize by unique source-root association, never by name. A new Pack needs at least one eligible Sample; reimport preserves ID, presentation data, and manual origins. |
| Change origin | Update `pack_id` and manual protection together; leave source location, Collection memberships, Categories, direct Author credits, and Favorites unchanged. |
| Source change/relink | Preserve Sample ID and organization, update verified source observations and revision, and invalidate old analysis. Reject an excluded or already-cataloged destination instead of merging. |
| Remove Pack | Detach its Samples via `SET NULL`, remove its credits/classifications, and retain Samples, roots, Favorites, and Collections. Schedule any unused cover for cleanup. |
| Remove Collection | Cascade only its memberships and schedule any unused cover for cleanup. |
| Remove Sample | Insert its canonical location into exclusions and delete the Sample/source pair and organization after confirmation. Keep audio; both changes commit or roll back together. |
| Reinclude source | Explicitly verify the location, remove its exclusion, and create a new Sample/source pair. Do not recover deleted IDs or annotations. |
| Unregister root | Disable registration, preserving root identity, Pack association, observations, and Samples. Re-registering reuses the root. |
| Remove Category/Author | Confirm affected uses, including Sample/Pack credits and any profile link, then delete the record and its associations without deleting resources or Preferences. |
| Reorder Collection | Validate the complete unique Sample sequence, then replace memberships with positions `0..n-1` in one transaction. Rollback preserves the prior order. |
| Edit profile | Update its name, optional Author link, or avatar; do not rename Authors or create credits. Replacing/removing an avatar uses shared image cleanup. |
| Save Preferences | Validate and update only the supported typed settings for the singleton profile; do not silently substitute defaults for invalid input or failed writes. |
| Assign Sample/Pack credits | Add/remove explicit Author-ID associations for the selected target only; no automatic inheritance or profile attribution. |
| Attach/replace image | Publish a validated managed copy, then atomically register its asset and update the cover/avatar reference. Preserve the previous image on failure; queue unused assets for cleanup. |

Exclusions are Library-wide across overlapping roots. Imports never clear them
automatically, and no committed source may share an excluded path. Sample
removal does not delete the original file or a source root.

Do not use `INSERT OR REPLACE` on entities: its deletion behavior can destroy
identity or trigger unwanted cascades. Use targeted updates and deliberate
`ON CONFLICT` handling. Use the reverse-reference indexes to show removal
effects and shared-cover uses before changes.

### Managed Image Lifecycle

Accept static PNG, JPEG, and WebP, up to **10 MiB (10,485,760 bytes)** and
**4096 pixels on each axis**, inclusive. Reject unsupported, animated,
oversized, corrupt, or unreadable images explicitly. No crop/edit workflow
is included. The same rules apply to Pack/Collection covers and the profile avatar.

1. Copy into a generated temporary path within the managed image directory
   and validate content. Never edit the user's original image.
2. Publish an immutable asset under its UUID-based filename without overwriting
   an existing file. A replacement creates a new asset; it never mutates an
   image shared by other entities.
3. Commit the asset record and entity reference atomically. Failure retains
   the previous entity state and requires cleanup of the newly managed copy.
4. Detaching the final reference marks the asset `cleanup_pending` in the same
   catalog transaction. A cleanup job rechecks Pack covers, Collection covers,
   and the UserProfile avatar, then confirms managed-path containment before
   deleting anything.
   Do not attach an asset already pending cleanup.
5. Delete only that validated managed file, then remove its unreferenced record.
   Cleanup failure retains the pending record for retry and surfaces the error
   without claiming successful cleanup.

Filesystem publication/deletion and SQL cannot share one transaction. On
restart, reconcile generated temporary files, published-but-unregistered
copies, and pending cleanup records within the managed scope. Do not follow
symlinks, delete referenced assets, sweep arbitrary files, or treat the user's
original images as managed copies. Coordination must prevent publication or
attachment racing with cleanup; file-work progress cannot imply success before
reconciliation.

## Implementation Order and Validation

1. Define typed entity contracts, command inputs, validation, normalization,
   and explicit error outcomes from the agreed domain.
2. Implement fresh-database initialization with `better-sqlite3`, worker
   lifecycle, prepared statements, transactions, and format/version checks.
3. Implement bounded queries and organization commands for all agreed entities,
   including profile bootstrap/edits, Preferences, Sample/source creation,
   direct credits, Pack conflicts, Collections, exclusions, and removal effects.
4. Implement shared managed images and recoverable cleanup, then expose narrow
   preload operations and connect the UI. Preserve preview and native dragging
   with authorization against the new source records.
5. Verify restart persistence, atomic rollback, foreign-key/uniqueness rules,
   manual-origin preservation, root overlap, source revision behavior, image
   limits, shared assets including avatars, volume restoration (including zero),
   independent credits, and interrupted publication/cleanup.
6. Validate the native driver and packaged application on each target platform.
   Persistent technical metadata and waveform analysis follow separately.

There is no prototype-data migration step. Do not add classes/services simply
because a table exists; keep explicit domain operations and small owning modules.
Add indexes for actual query shapes, not speculative full-text search.

Keep schema versioning from the first new delivery. Future released upgrades
require consistent backups, transactional changes, reference checks, and
explicit recovery; unsupported formats/versions, corruption, and storage
failure must never reset the database or fall back to successful in-memory
writes. These safeguards protect the new system, not prototype compatibility.

### Design Validation Evidence

The exact expanded 17-table DDL above passed 16 isolated in-memory scenarios
on macOS with SQLite 3.50.4 through Node.js 24.13.0. Checks covered singleton
profiles, preference references and volume boundaries/defaults, independent
Sample/Pack credits, linked-Author deletion, shared avatar/cover references,
image limits, atomic rollback, source identity, exclusions, Collection order,
Unicode keys, and query plans.

SQL checks are not a `better-sqlite3` implementation or application validation.
No real audio, images, or local database files were used.
Actual image validation, volume restoration, source-change detection, filesystem
recovery/concurrency, IPC, restart persistence, and macOS/Windows packaging
must be tested with the new implementation.

## Implemented Catalog and Favorites

The running code still uses the prototype
[Catalog](../../src/main/services/catalog/index.ts),
[worker](../../src/main/services/catalog/catalogWorker.ts), and
[store](../../src/main/services/catalog/catalogStore.ts). It persists selected
root associations and sample Favorites by canonical location with experimental
`node:sqlite`; the folder view remains session-scoped.

This is existing behavior only, not the architecture or schema contract for
the clean foundation. See [README](../../README.md) for its current limitations.
No prototype database or source file was deleted by this documentation change.

## Basic Rules

- Keep privileged filesystem/catalog operations in main-owned services and
  validate caller, frame, IDs, and authorization at IPC boundaries.
- Shared TypeScript types do not replace runtime validation. Return serializable
  domain results, not connections, generic query access, or decoded buffers.
- Keep handlers thin. Stream audio through the authorized local protocol.
- Query bounded results and refresh affected views only after confirmed
  outcomes; prevent stale responses and duplicate in-flight mutations.
- Surface failures distinctly from empty results and cancellation. Show
  per-item outcomes for partial filesystem work.
- Follow [Logging and Privacy](common-guidelines.md#logging-and-privacy).
  Diagnostics must not expose personal paths, complete catalog records, or
  raw filesystem errors.
- Own and close the worker/connection once, release listeners, and serialize
  shutdown with pending writes. Do not create database connections per UI row.
