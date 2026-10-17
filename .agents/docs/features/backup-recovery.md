# Backup and Recovery

Read when changing library backups, restoration, migration protection, or recovery
from catalog corruption. The rules below describe the complete agreed scope;
the startup-only slice documented below is implemented. [Data Access](../data-access.md) owns storage and
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
  directory entries are also flushed on macOS. Windows directory flush behavior
  and packaged interruption durability still require platform validation.
- Copies are staged in uniquely owned `.pending` directories and published by
  same-directory rename. Failed attempts remove only their own staging folder;
  interruption can leave an unpublished folder, never an accepted valid backup.
- Startup recovery selects a backup folder and reviews its date, location, scope,
  and replacement consequences. The worker validates it, creates a verified
  pre-restoration backup of the current catalog/images, stages the selected
  catalog, verifies/publishes missing immutable images without overwrite, then
  replaces the catalog by same-directory rename. Existing image conflicts block
  replacement. Preview and temporary audio authorization are not restored; source
  access still requires current-folder discovery and authorization.
- Interruption before catalog replacement leaves current references usable;
  after replacement the restored catalog references already-published images.
  Startup image reconciliation handles generated unreferenced images/temps.
  An interrupted catalog staging file is retained, not automatically replayed.
- A corrupt current catalog or missing current referenced image blocks restoration
  because a verified protective copy cannot be made. Explicit damaged-state
  preservation/recovery is **not implemented**. Settings backup creation,
  management/deletion, normal-runtime restoration, and confirmed-operation or
  analysis reconciliation also remain pending. The current implementation has
  neither persisted analysis nor confirmed operations to restore.
- Node filesystem/worker tests validate migration gating, rollback copies, WAL,
  tampering, immutable-image conflicts, restoration and current-state protection
  on macOS. A separate instrumented packaged macOS smoke also covers startup,
  migration protection, backup-location failure/retry, restoration and durable
  Favorites; see [Release Process](../release-process.md#local-packaged-recovery-smoke).
  Windows recovery remains unvalidated.

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
  fails, block replacement. Never label damaged evidence a valid backup.
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
Visual layout and exact routes remain to be designed.

Define archive/version manifests, consistency barriers, validation, safe staged
publication/replacement, damaged-state preservation, disk-space checks, bounded
management queries, authorization, IPC, failure recovery, and platform validation
before delivery. These contracts must fulfill the agreed rules without implying
that current migration rollback or operation journals already provide backups.
