# Backup and Recovery

Read when changing library backups, restoration, migration protection, or recovery
from catalog corruption. The rules below describe the complete agreed scope;
startup migration protection plus runtime creation, management and two-phase
restoration are implemented as documented below. [Data Access](../data-access.md) owns storage and
migration mechanics; [Operation Execution](operation-execution.md) owns confirmed
operation reconciliation.

## Implemented Startup Protection

- The DB worker creates a verified protective snapshot before applying pending
  migrations to an existing catalog. Fresh bootstrap and unchanged versions do
  not create copies. Failure blocks migration before any migration SQL runs.
- Copies are version-1 `kiter-backup` directories containing `manifest.json`,
  `catalog.sqlite`, and `images/`. The catalog includes saved organization,
  Favorites, profile and Preferences. Only referenced immutable managed images
  are copied; audio, caches, session capabilities and other backups are excluded.
- Default storage is `userData/db/backups/<timestamp>-<uuid>`. Copies are retained;
  there is no automatic rotation. Startup failure offers Retry, another backup
  directory, Restore backup, or Quit. Alternate storage is scoped to that startup.
- Capture runs before DB readiness, image reconciliation/publication, IPC, or
  other writers. `VACUUM INTO` captures committed SQLite WAL data. A versioned
  manifest records schema version, date, kind, byte sizes and SHA-256 hashes.
  Integrity, migration-prefix compatibility, required saved records and exact
  referenced-image coverage are verified before publication. Files are flushed;
  directory entries are also flushed on macOS. Windows directory flush is skipped,
  so rename and link durability there is unverified; see the platform statement at
  the end of this guide.
- Copies are staged in uniquely owned `.pending` directories and published by
  same-directory rename. Failed attempts remove only their own staging folder;
  interruption can leave an unpublished folder, never an accepted valid backup.
- Startup recovery selects a backup folder and reviews its date, location, scope,
  and replacement consequences. The worker validates it, creates a verified
  pre-restoration backup of the current catalog/images, stages the selected
  catalog, verifies/publishes missing immutable images without overwrite, then
  replaces the catalog by same-directory rename. Existing image conflicts block
  replacement. Publication links each verified temporary copy into place; a
  filesystem that refuses links (exFAT, FAT, some network volumes) copies it in
  exclusively instead and re-verifies it under its final name, so the
  never-overwrite rule holds everywhere. Preview and temporary audio authorization are not restored; source
  access still requires current-folder discovery and authorization.
- Interruption before catalog replacement leaves current references usable;
  after replacement the restored catalog references already-published images.
  Startup image reconciliation handles generated unreferenced images/temps.
  An interrupted catalog staging file is retained, not automatically replayed.
- A corrupt current catalog, or a missing current referenced image, blocks a _verified_
  protective copy. Its damaged state is preserved first, as described under
  [Preserved Damaged Libraries](#preserved-damaged-libraries). Confirmed-operation
  or analysis reconciliation also remains pending. The current implementation has
  neither persisted analysis nor confirmed operations to restore.

## Implemented Runtime Creation, Management and Two-Phase Restore

The database worker is the only catalog writer and answers one command at a time,
so a capture issued there observes a consistent catalog without any renderer-side
write barrier. The accepted cost is that queued commands wait for `VACUUM INTO`
and the image copies. These are worker commands, not catalog dispatch actions,
because they need the catalog file and managed storage.

- `create-backup` writes a verified copy with the `manual` manifest kind. A kind
  states why a copy exists, never whether it is valid; validity comes only from
  verifying the copy. Audio and unreferenced managed images are never included.
- `list-backups` is bounded: creation names folders with an ISO timestamp, so
  folder-name order is age order and only the requested page's manifests are read.
  A stored folder whose manifest cannot be read is counted in `skipped` and never
  listed as a restorable copy. A preserved damaged library is listed with
  `restorable: false`; every other entry is a copy a restore may be asked to verify.
- `delete-backup` accepts only a direct child of managed storage that carries a
  readable manifest. Links, paths outside managed storage and dot-prefixed staging
  folders are refused. A user-chosen destination is not offered yet, so nothing
  outside managed storage is removable.
- `restore-backup` is phase one of a two-phase restore: it refuses while a pending
  intent exists, verifies the selected copy, creates the mandatory `pre-restoration`
  protective copy, stages the catalog as a dot-prefixed `.restore` sibling, verifies
  and fsyncs it, publishes only missing immutable images without overwrite, then
  records a pending intent holding the staged basename, source, date, bytes and
  SHA-256. It swaps nothing and changes no live reference.
- `applyPendingRestore` is phase two and runs at bootstrap before the catalog is
  opened. A missing intent does nothing; an intent that does not parse or validate
  is discarded, never allowed to block startup. A staged copy whose bytes match the
  intent is renamed onto the catalog. When the staged copy is gone it distinguishes
  "already applied" from "the restore never happened" by the recorded SHA-256 and
  keeps the current library in the second case.
- The catalog runs in SQLite's rollback-journal mode, so an interrupted write
  leaves a hot `<catalog>-journal` describing pages that were only half written;
  `<catalog>-wal` and `<catalog>-shm` are the equivalent sidecars in WAL mode.
  Opening and closing the file is not enough: the journal is rolled back on the
  first **access**, and a write-ahead log is checkpointed explicitly, refusing to
  continue when the checkpoint reports itself busy.
- A catalog that is absent cannot be kept, so the verified staged copy replaces it
  and the swap proceeds. A catalog that is **damaged** is preserved first, inside
  the swap and before any sidecar is removed; if that preservation fails the swap
  is refused. Recovery that is merely blocked, by a read-only file or another
  connection, aborts the swap too and leaves every sidecar untouched, because they
  are still the library's only rollback. Only after the catalog is settled are the
  sidecars removed, before the rename and never after: renaming first would let
  SQLite replay foreign frames onto the restored catalog.
- Damage is decided from the bytes before the catalog is opened in the bootstrap
  path: a file without the SQLite header cannot be opened, and SQLite deletes
  `-journal` and `-wal` when that open fails. Reading it first would destroy the
  evidence preservation exists to keep. A valid header does not prove the body is
  readable, and the read that discovers that deletes the sidecars too, so they are
  copied into staging **before** the settle opens anything. The copies are what a
  damaged artifact keeps; a clean settle discards them. If preservation fails after
  such a read, the copies go back where a manual recovery looks for them.
- A swap that cannot be applied stops startup with an explicit failure instead of
  serving a session whose writes the next start discards. The intent stays, so a
  restart retries the same verified swap.
- Writes committed after phase one and before the restart are discarded by the
  swap. That is inherent to restoring an earlier copy; the pre-restoration
  protective copy captured the pre-phase-one state.
- Node filesystem/worker tests validate migration gating, rollback copies, WAL,
  tampering, immutable-image conflicts, restoration and current-state protection
  on macOS. A separate instrumented packaged macOS smoke also covers startup,
  migration protection, backup-location failure/retry, restoration and durable
  Favorites; see [Release Process](../release-process.md#local-packaged-recovery-smoke).
  Windows recovery is exercised by the full suite and the desktop suites on
  `windows-latest`, but not by a packaged installer on real hardware.

### Protective Copy Failure Causes

A protective copy reports the cause that produced it, so a caller can ask "is this
library damaged?" or "is the disk full?" instead of matching on one message. The
causes are `catalog-corrupt` (the catalog cannot be read as a database),
`catalog-invalid` (readable, but it fails stored-catalog validation),
`image-unavailable` (a referenced immutable image is gone), `image-invalid` (a
managed image path exists but cannot be used: a linked or unusable image directory,
an entry that is not a readable regular file, or a failed copy),
`insufficient-space`, `invalid-storage` (the backup storage directory is not a
usable directory), `manifest-too-large`, and `capture-failed` (the catalog could
not be captured, including a failed `VACUUM INTO`).

The taxonomy stays inside the main process: each surface presents one message, and
no renderer receives a cause list; a surface that words the same failure
differently keeps the cause instead of dropping it. Only `catalog-corrupt` and
`image-unavailable` are treated as a damaged library; every other cause keeps
blocking the migration or replacement, because waiting loses nothing. A readable
catalog that merely fails validation also keeps blocking for the same reason, and
so does an unusable image path: a linked image directory or an image entry that is
not a regular file is a condition to fix, not damage, and replacing a healthy
catalog for it would throw away working data.

### IPC and Preload Surface

The four worker commands are reachable through four IPC channels, and no other
backup channel exists. Each one is registered through the shared IPC helper that
owns main-frame authorization and the single storage failure policy, so a
destroyed sender or a subframe gets `UNAUTHORIZED` and no handler runs. Renderer
input is validated in the shared layer before any database method is called; the
worker protocol requires the absolute-path shape again. Containment differs per
command and must not be assumed: `backup:delete` refuses anything that is not a direct
child of managed storage, while `backup:restore` verifies the folder as a Kiter backup
and accepts it from any absolute path — the worker does not restrict a restore source
to managed storage. That is the intended shape for a user-chosen backup, and it is why
a surface must never treat a restore location as trusted input.

| Channel          | Takes                                                  | Returns                                                                                          |
| ---------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `backup:create`  | nothing; the managed destination belongs to the worker | `BackupSummary` of the published copy                                                            |
| `backup:list`    | an optional bounded page: `limit` 1-100, `offset` ≥ 0  | `BackupPage`: the page's copies plus `skipped`, the stored folders that are not readable backups |
| `backup:delete`  | `{ location }`, one exact stored folder                | `{ location }` of the removed copy                                                               |
| `backup:restore` | `{ location }`, one exact stored copy                  | `RestoreTicket` for phase one                                                                    |

- Failures cross the boundary as one stable error code and one message, never a
  database or filesystem error. A worker failure is normalised before it reaches the
  renderer, so the wording a renderer sees is the shared storage sentence, not the
  per-channel message the handler declares: a refused command that fails inside the
  worker answers `STORAGE_FAILED` and says the library could not be reached. It does
  not claim the library was unchanged, and no surface should read it as a guarantee.
- `backup:restore` is phase one of the two-phase restore: it stages the
  replacement and answers `restartRequired: true`. The catalog is replaced by the
  next start, so no surface may present the restore as finished, and writes made
  between the request and the restart are discarded (see above).
- Every listed copy carries `restorable`. A preserved damaged artifact is listed
  with `restorable: false` across the boundary, and `backup:restore` on its location
  is refused with `INVALID_INPUT` while the library stays untouched, so management
  can offer it for review and deletion but never for restoration.
- `BACKUP_LOCAL_LIMITATION` is the limitation every management surface must show:
  a copy kept on this computer does not survive losing its disk.
- The preload API validates every reply against the same domain shapes before the
  renderer can read it; a reply that does not match is a `PROTOCOL_ERROR` instead of
  unvalidated data.
- No Settings screen, route or component exists for any of this. The surface stops
  at the preload contract.

## Preserved Damaged Libraries

A current library that cannot form a verified protective copy because it is damaged
may still be replaced, but only after its damaged state is preserved. If that
preservation fails, replacement is blocked: the catalog, the intent and the staged
copy stay exactly as they were and a restart retries.

- The artifact is a managed folder named `<timestamp>-<uuid>`, published by the
  same staging rename as a backup. It holds `manifest.json`, `catalog.sqlite`, and
  the catalog's `-journal`, `-wal` and `-shm` sidecars when present. The sidecars
  are copied because they are the only manual recovery a damaged library has left;
  losing them defeats the purpose of preserving anything.
- `catalog.sqlite` is a raw copy, never `VACUUM INTO`: producing a vacuumed catalog
  is exactly what a damaged one cannot do. Hashes are recorded as evidence of what
  was kept and are never re-verified, because nothing can vouch for the contents.
- A zero-byte `catalog.sqlite` is legitimate evidence when the sidecars carry the
  recovery, so the catalog entry may be empty for `kind: 'damaged'` only; every
  restorable kind still requires a catalog. The sidecars are copied before the
  catalog is opened, because the open that decides damage is what deletes them.
- The artifact is read back through the same manifest reader that listing and
  deletion use, before it is renamed into place. An artifact nothing could list or
  delete would hide the only copy of the library the swap is about to discard, so
  that check fails the preservation and blocks the swap instead of publishing it.
- The manifest carries `kind: 'damaged'` and an explicit `verified: false`, and no
  schema version because nothing could read the catalog. Both directions are
  enforced: a damaged artifact can never be read as a valid copy, and only a damaged
  artifact may be unverified.
- Preservation runs inside both catalog-replacement paths: the startup restore and
  the bootstrap swap that applies a pending restore. It happens before any sidecar
  is removed and before the rename, so the artifact holds the bytes that were
  replaced. A blocked swap is acceptable: the catalog, the intent and the staged
  copy stay as they were. An artifact that cannot be read back is not.
- The artifact is visible in `backup:list` with `restorable: false`, so management
  can review and delete it. Preserving silently would be indistinguishable from
  deleting. `backup:restore` on its location is refused with `INVALID_INPUT`, and
  every restore path re-verifies the copy it is given, so the artifact is never
  accepted as a backup.
- A runtime restore request still blocks when the current library cannot form a
  verified copy; preservation covers the two replacement paths, not phase one.

## Backup Contents and Creation

- Include the catalog, organization, Preferences, other persistent application
  state, operation history/confirmed work, and referenced managed covers/avatar.
  Exclude original audio, rebuildable analysis caches, temporary authorizations,
  and session-only state. Explain the scope before creation; a backup cannot
  restore audio that was not included.
- Include persisted duration observations and automatic musical estimates with
  their source/analyzer versions and provenance, as well as manual musical
  decisions. These catalog observations are included even though they can be
  measured again; waveform data and other rebuildable caches remain excluded.
- Include independent pending-original cleanup/protection records and their
  verification evidence, even when the originating operation history was deleted.
- Support manual creation and mandatory automatic creation before a migration
  that changes an existing Library's data. Fresh bootstrap does not require a
  previous-library backup. No periodic schedule is included in this delivery.
- The user chooses the destination of each manual backup. Automatic pre-migration
  and pre-restoration backups use Kiter-managed local backup storage. Offer another
  location if required backup creation fails. Local copies do not protect against
  loss of the disk; make that limitation visible in backup management.
- Retain copies until explicit reviewed deletion; no automatic expiration or
  rotation. Do not include previous backup archives recursively in a new backup.
- Wait for active work to finish and prevent new writes/queued execution while
  capturing a consistent catalog and referenced images. Preserve queued work.
  Include saved data only; creating a backup neither discards drafts nor cancels
  active work. Technical coordination must also cover background writers/cleanup.
- A failed mandatory pre-migration backup blocks the migration. Leave current
  data untouched; offer Retry or another destination. Never bypass this protection,
  reset the catalog, or open an incompatible catalog as if ready.

## Reviewed Restoration

- Restore by replacing the one local Library, not merging catalogs or creating a
  selectable second Library. Validate integrity and compatibility before changing
  the current Library; show backup date, scope, and replacement consequences.
- Accept the current format and older formats with a supported migration path.
  Reject future/unsupported formats without modifying current data. Supported
  migrations still require the agreed backup protection.
- Resolve dirty forms before restoration, wait for active work to finish, prevent
  new writes/queued execution, and stop preview before replacement.
- Create a protective backup of the current Library before replacement. Failure
  blocks replacement. If current data is corrupt and cannot form a validated
  backup, allow explicitly confirmed recovery only after preserving a recoverable
  copy of the damaged state, clearly marked unvalidated. If preservation also
  fails, block replacement. Never label damaged evidence a valid backup. The
  implemented artifact, its visibility and its refusal are owned by
  [Preserved Damaged Libraries](#preserved-damaged-libraries).
- Restore catalog and managed images consistently and retain the protective copy.
  Restoration failure must preserve recoverable current data and report an
  accurate recoverable state, never silently reset or claim partial success.
- Preserve Sample identity/organization even when referenced audio is unavailable.
  Recheck sources and authorization before preview/drag; never restore temporary
  capabilities or automatically start audio or import files.
- Restored automatic observations are not effective until their validity against
  the current source has been verified. Invalidate/recalculate those that no longer
  apply under the analysis pause/retry rules. Preserve manual decisions under
  Musical Analysis's source-change review policy; never replace them with estimates.
- Reconcile restored confirmed operations and require manual continuation after
  verification/revalidation. Never blindly replay restored work or automatically
  resume it. Historical commits do not prove that external filesystem state still
  matches an older backup.

## Management and Remaining Delivery Contracts

Settings → Library exposes Create backup, Restore, and management of automatic
copies. Show date, kind, size, and location; review selected copies before deletion.
The worker commands, the `DbClient` methods, the IPC channels and the preload API
exist as documented under [IPC and Preload Surface](#ipc-and-preload-surface).
Visual layout, exact routes and every Settings screen remain to be designed: the
delivery that added the channels stopped at the preload contract and created no UI.

Remaining delivery contract is reconciliation of restored confirmed operations and
analysis once those exist. Platform validation is closed as a documented scope, not
as an open task: the full node suite and both desktop suites run on `windows-latest`
on every change, which covers the image publication path, both catalog-swap paths and
the restore recovery cases on real Windows. Three things CI cannot establish, and
which are limitations rather than pending work: directory flush is skipped on Windows,
so rename and link durability under power loss is unverified; a packaged installer on
real Windows hardware is not exercised; and publication on a non-NTFS volume is covered
by the fallback above but has never run against a real exFAT or FAT device.

Define archive/version manifests, consistency barriers, validation, safe staged
publication/replacement, disk-space checks, bounded management queries,
authorization, IPC, failure recovery, and platform validation before delivery.
These contracts must fulfill the agreed rules without implying that current
migration rollback or operation journals already provide backups.
