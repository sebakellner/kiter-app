# Domain Model

Read this guide when changing entities, relationships, metadata, lifecycle
behavior, or domain validation. See [AGENTS.md](../../AGENTS.md) for product
scope, [Architecture](architecture.md) for technical ownership, and
[Common Guidelines](common-guidelines.md) for implementation conventions.

## Status and Scope

This is a conceptual model for Kiter's local sample library, not a database
schema or a claim that the described entities already exist.

The [current shared contract](../../src/shared/ipc.ts) defines `AudioFile`,
`AudioSample`, and drag errors for a session-scoped listing. It has no persistent
sample IDs, kits, classification records, favorite lists, or durable tasks.
Extend those contracts incrementally as features are implemented; do not replace
working listing types with a speculative complete model.

Fields below describe information responsibilities, not mandatory form fields.
Storage types, validation limits, cardinalities marked as open, and deletion
policies must be agreed before their implementation.

## Identity and Sources of Truth

- A sample's durable ID identifies its catalog record, not its filename,
  current path, content hash, or temporary audio URL.
- Filesystem observations describe what exists on disk. Catalog data describes
  user organization and references. Neither can silently overwrite the other.
- Technical metadata comes from an identified source file version. User data
  and automatic suggestions have separate provenance.
- Session authorization identifiers are temporary capabilities. They must not
  become persisted membership, favorite, or task references.
- Same-name files are not necessarily the same sample; equal content does not
  authorize merging records or deleting one of the files.

## Core Entities (Planned)

| Concept | Responsibility | Information to represent |
| --- | --- | --- |
| Library root | A user-selected directory registered for discovery. | Stable ID, location, display name, scan state, and last scan outcome. |
| Sample | A cataloged audio resource independent of its current location. | Stable ID, display data, location reference, availability, and user annotations. |
| File location | Where the sample's source file is currently expected. | Root association when applicable, path, observed file version, and last successful verification. |
| Technical metadata | Measurements extracted from audio. | Source version, duration, sample rate, channels, format/codec where known, and extraction status. |
| Waveform analysis | Rebuildable visualization data. | Sample ID, source version, analysis version, duration, and reduced peaks. |
| Kit | A named collection of sample references with its own presentation data. | Stable ID, name, description, cover reference, and declared classification data. |
| Kit membership | The relationship between a kit and a sample. | Kit ID, sample ID, and ordering if the feature requires it. |
| Cover asset | An imported image used to present a kit. | Stable asset reference, app-managed location, and validated image information. |
| Category | A primary organizational classification. | Stable ID and display name; hierarchy only if agreed. |
| Tag | A flexible additional classification label. | Stable ID and display name, with an agreed matching policy. |
| Owner | A declared author, producer, or owner label. | Stable ID and display data; not an account or authorization principal. |
| Favorite | A user mark referencing a sample. | Sample ID and optional marking time. |
| Favorite list | A named collection of sample references. | Stable ID, name, and memberships; ordering if required. |
| Organization suggestion | A proposed classification, grouping, or file action. | Target references, proposed changes, origin, and review status. |
| Task | A tracked operation with explicit scope and outcomes. | Stable ID, operation kind, state, progress, cancellation request, and item results. |
| File operation plan | A reviewable intent to rename, relocate, centralize, or export. | Source references/versions, destinations, conflicts, confirmation, and execution outcomes. |

Separate concepts do not require separate classes, tables, or packages.
Represent them with the simplest structures that preserve their rules.

## Relationships

The intended relationship structure is:

```text
Library root -> discovered file locations -> catalog samples
Sample -> technical metadata and derived waveform analysis
Kit -> memberships -> samples
Kit -> cover asset
Sample / kit -> classification and declared owner assignments
Favorite / favorite-list membership -> sample
Organization suggestion -> proposed metadata or file-operation changes
Task -> operation scope and per-item outcomes
File operation plan -> source samples and destination files
```

- Collections reference sample IDs and never require duplicate audio files.
- Kits and imported roots are different concepts. A folder may seed a kit,
  but moving a folder must not define the kit's identity or membership.
- **Proposed:** allow a sample in multiple kits and lists through memberships.
  Confirm this before implementing membership persistence.
- **Proposed:** tags are many-to-many. Whether a sample or kit has one or
  multiple categories or owners remains a product decision.
- A kit's classification does not automatically become each sample's stored
  classification. Define any inherited display/filter behavior explicitly.
- Registering overlapping roots must not create duplicate catalog entries for
  the same observed file. Define root association and reconciliation before
  supporting overlapping imports; do not equate different copies by filename.
- Relocation may change root association while preserving sample identity.
  Destinations outside imported roots must be explicitly authorized and modeled.

## Availability and Analysis

Availability and analysis are independent:

- **Available:** the expected source is accessible and verified.
- **Missing:** the file or its root is no longer present at the expected location.
- **Inaccessible:** access cannot currently be obtained, such as denied permissions.
- Analysis may be **not requested**, **queued**, **running**, **ready**,
  **failed**, or **stale**. These are planned semantic states, not an existing enum.

A visible listing may contain a sample whose codec cannot be decoded.
Metadata extraction, waveform generation, preview playback, and DAW import
have separate capabilities and errors; do not collapse them into one
`supported` flag.

Use explicit units: duration in seconds, sample rate in Hz, channel count as a
positive integer, and file size in bytes. Unknown values remain unknown, not
zero. Musical attributes such as BPM or key require a separately scoped
analyzer and provenance; filenames alone are not verified measurements.

Changing a source invalidates its derived metadata and waveform. Missing files
retain catalog identity and organization. Relinking requires user confirmation
or an agreed reliable matching policy; a file reappearing at an old path is not
automatically proof of unchanged content.

## Domain Operations and Invariants

### Import and Kit Creation

Import discovers and registers files without moving or modifying them.
Rescanning reconciles observations while preserving user data and memberships.
Creating a kit from a folder selects discovered sample references and creates
kit data; copying or centralizing those files is a separate operation.

Repeated import must not create repeated entries for the same verified file.
Hash-based duplicate suggestions may be introduced later, but must not silently
merge sample identities.

### Organization and Favorites

User edits are authoritative for user-managed fields. Suggestions remain
reviewable and must not replace accepted classifications during a rescan.
Rejected or stale suggestions must not execute later without renewed review.

Favorite marks and named lists are independent concepts. Whether list membership
also implies a global favorite mark is an open product decision.
Removing a membership never deletes the sample or its file.

### Rename, Relocate, Centralize, and Export

Renaming or relocating changes the source location while preserving the sample
ID and all kit/favorite references. Centralization is a reviewed batch of file
operations, not a new sample identity.

Export creates destination files without changing the original sample's source.
An exported copy is not automatically a new catalog sample. Metadata inclusion,
export layout, and kit manifest format require explicit product decisions.

Use the recoverable planning workflow in
[Architecture](architecture.md#safe-file-operations-planned).
Conflicts and failures are explicit outcomes; neither confirmation nor a valid
catalog record guarantees a file action will succeed.

### Tasks and Recovery

Proposed task states are **queued**, **running**, **completed**, **partial**,
**failed**, and **canceled**. A cancellation request is separate from its final
outcome: already completed file changes remain completed.

Track item outcomes so a batch can explain what changed, failed, or was skipped.
Progress must use an identified unit and must not imply success before results
are recorded. Interrupted work requires reconciliation before retry; task
unification must not merge conflicting operations on the same file.

### Removal and Deletion

Removing a kit, list, or catalog reference is distinct from deleting audio.
Do not cascade metadata deletion into filesystem deletion.

Define handling of referenced categories, owners, assets, roots, and samples
before shipping removal actions. Explain affected references and obtain
confirmation where required. Derived caches can be rebuilt; user organization
must not be treated as disposable cache data.

## Decisions to Resolve Before Implementation

- Kit/category/owner cardinalities, ordering rules, and naming uniqueness.
- Whether category hierarchy or inherited kit classifications are needed.
- Whether one sample may track multiple physical locations and how copies,
  overlapping roots, external edits, and relinking are reconciled.
- Favorite-list semantics, removal policies, and managed cover-asset retention.
- Automatic suggestion rules and whether confidence values are meaningful.
- Export layout/metadata format and file-conflict resolution options.
- Durable task states, retry rules, and verification required before deleting
  a source during relocation.

Record approved decisions here when scoped. Add executable contracts and tests
in the owning feature; this document is not a substitute for runtime validation.
