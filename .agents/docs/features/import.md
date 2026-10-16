# Import

Read when changing discovery, import preparation/review, Pack registration,
reimport, commit boundaries, or import result membership. This guide owns the
planned reviewed import workflow. [Domain Model](../domain-model.md) owns Sample
identity, origin, and preservation invariants; [Data Access](../data-access.md)
owns implemented worker/storage operations.

## Status

The reviewed workflow below is agreed, not implemented. Current folder browsing
imports catalog content directly. Internal Pack preparation catalogs Samples
before confirmation; canceling that existing confirmation does not roll them
back. Adapt or complement it before delivering selection-before-write behavior.
UI shape is agreed where recorded; visual design/prototypes remain deferred.

### Implemented Internal Pack Contract

Internal Pack/member/import-candidate pages default to 50, maximum 100. Packs
sort by stored name/UUID, members by canonical path/UUID, candidates by Sample
UUID. Reviews hash completed scan, Pack presentation, and exact candidate source
revisions/origins in bounded batches. Every conflict requires exactly one keep
or assign decision; extra, missing, or repeated decisions are rejected. Manual
standalone origins conflict too; an already matching manual origin stays manual.
Changed state returns `STALE_REVIEW` inside confirmation transaction. Preparation
currently imports Samples first and cancellation leaves prior origins/catalog
records intact. This existing contract is not the planned selected-file workflow.

## Discovery and Preparation

- Support multiple selected folders and subfolders in one operation, without
  moving or modifying source audio. Use a large step-based dialog for selection,
  discovery, review, confirmation, and results.
- After discovery choose standalone Samples for all roots, or Pack mode with one
  new Pack per selected folder and independent presentation. Subfolders do not
  become Packs automatically.
- Start eligible files checked; allow unchecking files/subfolders, distinguishing
  existing and new Samples. Discovery/review must not catalog unchecked new files.
- A former source location vacated by a completed move/relink can supply a new
  explicitly reviewed import candidate with a new Sample identity. Do not infer
  that it is the relocated Sample or reconnect that Sample by the old path.
  Exclusions and independent pending-original cleanup protection take precedence;
  [File Organization](file-organization.md#verified-execution-and-partial-outcomes)
  owns protection resolution before such an original becomes importable.
- Incomplete discovery blocks confirmation until rescanned successfully or the
  affected folder is removed. Never commit incomplete scans as complete results.
- New Packs offer name, optional description/cover, Categories, and Authors;
  only name is required, suggested from folder name. Genre/type suggestion
  integration follows [Classification](classification.md). Existing Pack reimport
  preserves stored presentation rather than import defaults.
- Permit overlapping roots with explicit review, one occurrence per file, stable
  Sample identity reuse, and a root choice when destination Pack is affected.
- Group selected roots into one existing-Pack review only when actual registered
  associations identify that Pack. Deduplicate Samples and preserve presentation;
  never infer identity from names. Multi-root source-association contracts still
  need technical validation.
- Resolve origin conflicts per Sample with explicit keep/assign decisions, never
  group decisions. Protect existing origins and manual standalone corrections;
  standalone import is not permission to clear an origin.
- Closing unconfirmed preparation retains folders, selection, entered data, and
  staged classification decisions for the session. Reopen and revalidate before
  confirmation; discard writes nothing. No unconfirmed recovery after restart.
- If sources/origins or other relevant import state changed, repeat affected
  folder discovery/review, retaining entered presentation but requiring fresh
  selection and origin review. Classification-specific stale decisions follow
  their own per-target rules without weakening this import review.

## Commit Boundaries

These target transactions are planned replacements for the existing preparation/
Pack confirmation sequence, not descriptions of current commands.

- New imported file: Sample, source, and reviewed classification decisions commit
  together or not at all. Prior committed Samples remain intact on later failure.
- New Pack: commit presentation/classification, first reviewed origin association,
  and required Sample writes together, including source/classification when that
  Sample is new. The first association may reuse an existing reviewed Sample.
  Do not leave a new empty Pack after this transaction fails.
- Later Samples commit independently; a failure may leave a partially populated
  Pack that must be reported as partial, not rolled back implicitly.
- Existing Pack: commit its reviewed classification before its Samples. Failure
  blocks its Samples and stops the import batch. A later Sample failure preserves
  and reports those committed Pack changes.
- Reimported Pack member: source observation, reviewed classification decisions,
  and explicit origin decision commit atomically per Sample, preserving earlier
  committed targets. Keep origin decisions individual.
- Classification decisions include necessary vocabulary creation, assignments,
  types, and explicit rejections under [Classification](classification.md#confirmed-execution).
- A folder is not an all-or-nothing transaction. Record outcomes transactionally
  with changes under [Operation Execution](operation-execution.md#verifiable-recovery).

## Execution, Failures, and Retry

- Confirmed import is not cancelable in this delivery. Minimize progress to keep
  working; closing/minimizing its dialog is not cancellation.
- An execution failure, including classification-write failure, stops the batch;
  begin no later folders. Preserve committed content and distinguish completed,
  failed, and unprocessed work, including intermediate stages.
- Retry prepares the entire original batch again: rediscover, reuse surviving
  identities, and obtain new review. It is not blind replay or failed-only Retry.
- Shared queue ordering, revalidation, Needs review, ordinary-exit guard, and
  interruption reconciliation are owned by [Operation Execution](operation-execution.md).
  A failed import batch does not prevent the next queued operation from running.

## Progress and Results

- After confirmation allow navigation and minimizing/reopening progress through
  the global operation indicator. While its dialog is open, audio continues but
  the underlying player is not interactive; minimize to interact elsewhere.
- Report stages and file-level progress/results, using percentages only when
  totals are known. Distinguish discovery, catalog writes, and Pack registration.
- Offer Open per root (Pack detail or Samples filtered by root), a combined
  operation Sample view, or return to prior context, based on actual outcomes.
- Combined membership includes successfully included Samples, even unchanged
  existing ones, and excludes failed/unchecked files. Report created, updated,
  unchanged, failed, and unprocessed scopes accurately. Exact stage completion
  and result queries still need executable contracts.
- Historical results describe execution-time events and separately indicate
  whether referenced identities survive. Links open surviving current records;
  later origin changes do not rewrite history.
- [Operation history](operation-execution.md#history-and-result-access) owns
  retention, cleanup, deleted-record behavior, and recovery verification.
- Home content recency remains owned by [UX Design](../ux-design.md#home--agreed-content),
  distinct from operation history and no-op/failed operation records.

## Remaining Technical Contracts

Define exact discovery/confirmation commands, review/source revision tokens,
root associations, bounded preparations, selected-file write orchestration,
operation membership queries, and migrations before delivery. Preserve existing
preview, Favorites, and authorized native dragging. Planned registration must
reuse existing identities and never silently reset user data.
