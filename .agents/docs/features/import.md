# Import

Read when changing discovery, import preparation/review, Pack registration,
reimport, commit boundaries, or import result membership. This guide owns the
planned reviewed import workflow. [Domain Model](../domain-model.md) owns Sample
identity, origin, and preservation invariants; [Data Access](../data-access.md)
owns implemented worker/storage operations.

## Status

The reviewed step-based workflow below is agreed, not implemented. What ships today is a
dialog reached from the header's import action: it selects one or more folders, offers one
Pack per folder or standalone Samples, reviews each folder (editable Pack name, Sample and
conflict counts), and reports a per-folder result. It is built on the internal Pack
preparation below, so preparing catalogs Samples before confirmation and cancelling keeps
them as standalone Samples. Selection-before-write remains to be delivered.

Delivered by that dialog: multi-folder selection, the mode choice, one Pack per selected
folder with an editable name, a per-folder failure that never hides the others, the refusal
to give one source root a second Pack, and a folder with conflicting Samples blocking
confirmation with a count. Not delivered: per-Sample keep/assign conflict decisions, so a
conflicted folder cannot be imported yet; description, cover, Instruments and Authors per
Pack; reimport into an existing Pack; and the step-based discovery/review dialog described
below. UI shape is agreed where recorded; visual design/prototypes remain deferred.

Internal read-only preparation, selection/origin review, and spooled classification
drafts for Block 2 are implemented as described below. They do not
replace current folder browsing or the older internal Pack preparation, and is
not connected to Electron IPC, native folder selection, or UI yet.

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
- New Packs offer name, optional description/cover, Instruments, and Authors;
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

## Implemented Internal Read-Only Preparation — Block 1

`src/main/services/import-preparation/index.ts` exports
`ImportPreparationService`, to be instantiated once per future main-owned window
workflow with the existing `DbClient` and an application-owned temporary parent.
This is an internal service, not a renderer API or authorization boundary.

- `prepare(directories)` accepts 1–32 absolute selected-root paths from a trusted
  main caller, discovers supported audio asynchronously with `opendir`, and
  returns an immutable preparation summary. Only one preparing/live session is
  allowed per service; discard it before preparing another.
- Preparation performs no catalog writes: no Sample/Pack/vocabulary/root creation,
  source observations, scan metadata, exclusion removal, origin changes, or audio
  capability publication. The previous import entry points remain unchanged.
- `DbClient.readImportCatalog({ roots, paths })` uses a validated private worker
  command and a read-only transaction. It returns existing/new/excluded locations,
  Sample IDs, origin/manual protection, source revision/observations, exact-root
  registration state, and associated Pack identity/name. Requests allow at most
  32 distinct roots and 100 distinct paths. Empty requests return empty snapshots.
- Discovery rejects selected roots containing symlink components, skips/reports
  child symlinks including cycles, checks canonical containment/readability, and
  blocks roots on unreadable entries, unsafe roots, depth/entry/resource limits,
  or changed observations of the same file across overlapping roots. Inactive
  registrations are inspectable but explicitly blocked, never reactivated.
- Candidates deduplicate by exact canonical location, retaining root-local IDs
  and relative paths for every selected occurrence. Different physical locations
  remain distinct even with equal names or contents. Candidate IDs are scoped to
  the preparation, not reserved Sample UUIDs.
- A candidate retains its first discovery/source observation. If a later
  overlapping-root observation differs, `SOURCE_CHANGED` blocks the preparation
  without replacing that snapshot. Its stored metadata is not a claim about the
  current source. Fresh discovery is required before review; this block supports
  discard/reprepare, while root rescan belongs to Block 2.
- `discoveredCount` counts readable supported file occurrences per root, including
  excluded locations and files also observed through other roots. `candidateCount`
  counts unique candidates actually retained in the preparation spool. They are
  not imported-file counts or interchangeable totals: overlap can increase the
  sum of root discoveries, and a resource limit can stop storage within a batch
  already observed. Such incomplete preparations stay blocked.
- Candidate records and ordinal indexes live in an exclusively created temporary
  directory, with bounded in-memory discovery/query batches. `get(id)` returns a
  defensive summary copy. `listCandidates` accepts preparation ID, revision,
  optional cursor/limit, and returns stable discovery-order pages (50/default,
  100/max), total, revision and next cursor. These are prototype observation pages,
  not final execution order or a sealed review.
- Preparations are immutable at revision 1 in this block, with `ready` or `blocked`
  state. Here `ready` means discovery finished, not reviewed/confirmable. Cursors
  from another preparation or revision reject; pagination never silently refreshes
  catalog observations or invents replacement candidates.
- Catalog observations are transactionally consistent per bounded worker request,
  not one database/filesystem snapshot across the entire preparation. Later catalog
  or filesystem edits require authoritative revalidation in the review/execution
  blocks; this slice does not issue a confirmation token or claim freshness.
- `discard(id, revision)` invalidates the preparation and removes only its owned
  temporary directory. Failed cleanup reports an error, blocks further reads/new
  preparation, and permits cleanup retry. `close()` drains in-flight preparation
  and cleans temporary resources, including retained failed-build cleanup. Future
  Electron owner-destruction/shutdown wiring and restart orphan cleanup are not
  implemented; no draft recovery is provided.
- Preparation, page-read and cleanup errors retain their original causes locally
  when wrapped. If preparation and cleanup both fail, an internal aggregate cause
  preserves both failures and cleanup remains retryable through `close()`. Raw
  causes are non-enumerable and are not part of the IPC error envelope. Diagnostic
  logs at those wrapping boundaries contain only a fixed operation/stage and an
  allowlisted error code, never source paths, error messages, stacks or payloads.
  Unknown codes use `UNEXPECTED_ERROR` rather than trusting arbitrary native codes.
- Internal safety ceilings: 20,000 unique candidates, 200,000 traversed entries
  per root, depth 64, 64 MiB serialized candidate/index content, and the first 100
  issue details per root with a separate full issue count. Limits block rather
  than label truncated discovery complete. These are conservative prototype
  ceilings, not measured large-library or on-disk allocation guarantees; filesystem
  block/metadata overhead is not included in the serialized-byte budget.

Coverage includes unchanged serialized catalog/audio before and after preparation
and discard, existing Pack/manual-origin/exclusion context, overlapping roots,
bounded queries/pages, stale/foreign cursors, selected/child symlinks, unreadable
subfolders, inactive roots, catalog failures, close/drain cleanup, source changes,
depth limits, combined preparation/cleanup failures, sanitized diagnostics,
first-observation preservation through source changes and fresh discovery, and
the real private-worker command. Automated local validation is
on macOS; Windows, packaged Electron, UI, and actual DAW reception are unvalidated.

## Implemented Internal Selection and Review — Block 2 Core

The same `ImportPreparationService` now supports session-local editing and a
selection/origin-review seal. It remains catalog-read-only and is not connected
to IPC, native selection, renderer UI, confirmation, or execution. The immutable
revision-1 behavior above describes the original Block 1 slice; successful edits
now advance revisions and invalidate any seal and prior cursors.

- `setMode` explicitly chooses `standalone` or `pack`; preparation initially has
  no mode. Standalone preserves all existing origins. Mode changes clear dependent
  destinations/origin decisions without discarding new-Pack presentation drafts.
- `setSelection` accepts 1–100 distinct candidate choices atomically. Excluded
  files start unchecked and cannot be selected. `setSubtreeSelection` applies one
  root-relative folder scope (empty string for the whole root) to the server-held
  discovery snapshot, including unloaded pages. It changes each shared file once;
  traversal, absolute and unknown nonempty scopes reject. Windows accepts both
  slash spellings, normalizing them to native snapshot separators; drive-relative
  and UNC scopes reject. POSIX preserves literal backslashes in folder names.
  Repeated/trailing separators normalize without collapsing traversal components.
- `listCandidates` includes selected state, pending fresh-selection review,
  containing destination root IDs, chosen destination, origin conflict and staged
  individual resolution. Candidate pages and `listReview` remain 50/default,
  100/max. Cursor kind, preparation, revision and review token are pinned; these
  query types cannot exchange cursors. Returned data is detached from service state.
- `setDestinations` accepts 1–100 distinct candidates and only their verified
  containing roots in Pack mode. Overlap needs an explicit destination; changing
  it clears that candidate's origin resolution. No arbitrary existing Pack can be
  supplied. Grouped multiroot Pack reimport is explicitly unsupported.
- `setOriginDecisions` accepts 1–100 distinct selected conflicts, each naming its
  chosen destination and `keep` or `assign`. Other-Pack and manually standalone
  origins conflict; matching manual Pack origins do not. Unrelated, repeated,
  foreign and wrong-destination decisions reject without partially editing drafts.
- `setPackDetails` stages only name/description for a new-Pack root, using existing
  domain validation. It cannot change an existing Pack's stored presentation.
  Names default to the selected folder's name; sealing requires at least one
  prospective associated Sample for every new Pack, not merely a kept conflict.
  Suggested names are validated immediately: valid suggestions use domain
  normalization, while invalid ones retain their exact text and expose
  `nameIssue: INVALID_NAME` in that root's draft. Entering Pack mode remains
  possible so `setPackDetails` can explicitly correct the name and clear the issue.
  Standalone review does not depend on unused Pack-name suggestions.
- `removeRoot` publishes a replacement spool without rediscovering other roots.
  Unique candidates from that root disappear; shared candidate IDs survive once.
  Shared candidates lose dependent choices and require explicit fresh selection.
  Removing all roots is allowed as an empty draft, but it cannot be sealed.
- `rescanRoot` currently rediscovers **all retained roots** into a replacement
  spool to reconcile overlapping first observations safely. Preparation/root IDs
  and canonical-location candidate IDs survive. Presentation is retained;
  unaffected exact candidate/root inputs retain choices. Candidates in the requested
  root, previously blocked/changed root contexts, new candidates and changed
  observations start unchecked and need explicit fresh selection, even when the
  intended choice is to leave them unchecked. Their destinations and origin
  resolutions are not replayed. Exclusions never require or permit selection.
- `review` rediscovers complete roots and compares filesystem size/mtime,
  containment/readability/symlink policy, file occurrence counts, skipped links,
  and bounded catalog snapshots. Relevant changes increment revision, block the
  affected roots with `REVIEW_CHANGED`, revoke the seal and require rescan/review.
  Favorite/Collection changes are outside this snapshot and do not invalidate it.
  Reopening through `review` revokes an earlier seal even if revalidation fails.
- The original internal `contractVersion: 1` seal hashes root snapshots, mode, presentation,
  exact candidate/selection/destination/origin observations and discovery order in
  batches of at most 100. `listReview` pages selected candidates under that seal.
  This is **not** the complete proposed execution plan or its final target order:
  no confirmation method consumes it, no new entity IDs are reserved, and it does
  not bind classifications, credits, staged images or full existing-Pack metadata.
  Classification-enabled preparations now use the version-2 extension below.
  Filesystem/catalog reads are not one atomic snapshot and stat equality is not
  content verification. Durable confirmation must extend/version the plan and
  independently revalidate it before any write.
- At most one edit/rescan/review runs per service; concurrent work rejects instead
  of accumulating an unbounded queue. These internal APIs are asynchronous
  promises, not renderer progress handles. Sparse choices are bounded by the
  20,000-candidate ceiling, with copy-before-publication draft updates. Candidate
  payloads stay paged on disk. Replacement retains at most two 64-MiB serialized
  spools; these limits still do not measure filesystem overhead or responsiveness.
- Failed replacement construction preserves prior input and cleans its own spool.
  Failed old-generation cleanup after publication reports failure while leaving
  the new revision inspectable; further edits block until discard/close cleanup.
  Discard invalidates reads, drains in-flight work and retries all owned resources.
  Wrapped failures retain non-enumerable local causes and sanitized diagnostics.
  Unexpected work failures name their actual edit/rescan/review operation, not a
  generic review stage; operation names and error codes remain allowlisted.

**Remaining Block 2 integration:** Suggested classification decisions now use the
shared protocol through the spooled integration below. Explicit new-Pack assignment/
Author-credit drafts are also implemented below; Sample/existing-Pack manual edits
and staged cover ownership remain outside this slice. Strict edit schemas do not
silently accept cover fields. No UI, database migration or
user-facing import path is delivered by these internal slices.

Coverage includes unloaded subtree selection, atomic invalid-choice rejection,
revision/cursor/token invalidation, overlap destinations, manual/other-Pack origins,
new-Pack prospective membership, existing-Pack presentation preservation, relevant
versus unrelated catalog changes, changed/added/missing sources, rescan/root removal,
concurrent work, close/discard draining, failed replacement cleanup and cause/log
privacy. Automated validation is on macOS; Windows, packaged Electron, UI, large
library performance and DAW reception remain unvalidated for this workflow.

## Implemented Internal Import Classification Drafts — Block 2 Integration

`ImportPreparationService` now composes Classification's
[shared batch contract and review rules](classification.md#implemented-shared-batch-contract-and-session-review-core)
with the full selected import scope. The immediate inspector/apply protocol remains
unchanged. There are no catalog writes, audio changes, classification/rejection
storage, execution, Electron IPC, or renderer UI in this slice.

- `prepareClassifications({ preparationId, revision })` requires complete discovery,
  reviewed selection, mode/destinations/origin decisions, and valid prospective Pack
  membership under the existing preparation rules. It streams selected candidates
  into a new immutable temporary generation, with Packs first. Unchecked/excluded
  candidates supply no proposals. Standalone mode still preserves existing origins.
- Sample evidence combines eligible selected containing-root names, descendants and
  filename, independently of destination. Physical folder occurrences deduplicate
  across overlapping roots. Pack evidence uses only its supplying root name, never
  its edited presentation name or aggregated members. Retained and assigned origins
  supply their own saved Genres; only explicitly accepted staged Pack Genres become
  additional Sample evidence/dependencies. Pack Instruments/Authors are not inherited.
- A private `DbClient.readImportClassificationContext` command reads vocabulary,
  effective aliases, direct assignments and saved type without writes. Requests use
  at most 100 catalog target identities; vocabulary/alias pages advance by 100 raw
  rows under a SHA-256 vocabulary token. Each worker read is transactional, with
  10,000-row vocabulary/alias ceilings, at most 1,000 combined assignments per target
  and an 8-MiB response ceiling. Deleted aliases never contribute terms. Missing
  identities or vocabulary changes during a generation fail rather than publishing
  mixed observations. Several worker reads are not one catalog/filesystem snapshot.
- Import reuses Classification's pure recognition and validated row/fingerprint
  preparation, not a second accept/reject or evidence-key format. It composes at
  most one Sample and its origin Pack per recognition chunk; the pure core's
  100-target in-memory limit does not cap the overall import preparation.
- `getClassificationSummary` reports the entire current scope, including target/
  proposal/ambiguity counts, required vocabulary creations, saved-type replacements,
  and accepted/rejected counts. `listClassifications` accepts the preparation
  revision, `classificationToken`, optional offset/limit, and `kind` of `proposals`,
  `ambiguities`, or `decisions`. Pages default to 50, maximum 100. Decision pages
  include only explicit choices and retain shared evidence keys for later atomic
  assignment/rejection execution; they are not execution authorization.
- `stageClassifications` validates 1–100 unique current proposal keys as a group,
  supporting accept/reject/unreviewed. `acceptAllClassifications` requires the
  complete current classification reference and stages all its reviewable proposals,
  including unloaded pages. There is no page/filter-local interpretation. Both build
  and publish a replacement generation before returning a new preparation revision.
- Accepting a Pack Genre can introduce or change Sample evidence. Newly derived
  suggestions, and decisions invalidated by that evidence change, require fresh
  review; the same Accept all does not silently extend to suggestions that were not
  in its reviewed scope. Unchanged Instrument/type proposals can retain decisions
  when only Genre evidence changes. Mutation results report invalidated decisions.
- Selection/destination/origin edits invalidate affected candidate choices, including
  deselect/reselect cycles. Rescans/root removal preserve only unaffected decisions.
  A dirty generation cannot serve current pages until rebuilt. Refresh retains
  choices only for exact shared fingerprints; unrelated Favorite/Collection edits
  do not invalidate them. Rejection choices remain drafts, not persisted memory.
- `review` revalidates discovery/origins as before, then rebuilds active classification
  inputs. Changed classification scope publishes the refreshed revision and returns
  `STALE_REVIEW` for fresh inspection. Unreviewed/ambiguous suggestions do not block
  sealing. Enabled preparations use `contractVersion: 2`, binding the complete
  `classificationDigest` and all staged decisions. Preparations that never enable
  classification retain the version-1 selection/origin seal. Neither is confirmable
  without the remaining execution/credits/image contracts and revalidation.
  Preparations with explicit new-Pack organization use the version-3 extension below.
- Generations live beneath the exclusively owned candidate spool and retain
  per-record content hashes. Pages fail explicitly on tampering or missing storage.
  Failed builds preserve prior published input. Failed post-publication cleanup
  leaves the new revision inspectable but blocks further edits; parent discard/close
  drains work and cleans all nested resources, including failed-build cleanup.

Additional conservative ceilings are 20,032 target records, 100,000 proposals,
500,000 evidence rows including ambiguity evidence, 8 MiB per target record, and
256 MiB serialized classification content per generation. A retained generation
and its replacement can coexist while building; indexes/choice metadata remain
bounded by these counts. Limits fail explicitly without truncated scope. These are
not measured memory/disk-allocation budgets or qualified large-library throughput.

Coverage includes whole-scope acceptance beyond 100 targets, overlap evidence,
retained/reassigned origins, staged Pack dependencies, explicit type replacements,
selection/rescan/root-removal invalidation, stale/foreign scope, vocabulary edits,
partial build/cleanup failures, corruption, bounded records, detached pages, catalog/
audio preservation, and the real worker command. Automated checks are local on
macOS; Windows, packaged Electron/UI/DAW behavior and full-capacity performance
remain unvalidated.

## Implemented Internal New-Pack Organization and Credits

This internal slice allows explicit Instruments, Genres and Author credits for
**new Packs only**. It does not edit existing Packs or selected Samples, create
catalog/vocabulary/Author records, mutate audio, or add Electron IPC/UI. Authors may
be selected from the catalog or explicitly prepared as new session-local identities.
Cover staging and durable execution remain separate delivery work.

- `preparePackOrganization` accepts preparation/revision/root identity, reads a
  catalog snapshot and returns an `organizationToken` plus the retained draft.
  `listPackOrganizationOptions` pages Instruments, Genres, Authors, existing Author
  drafts, or Author suggestions; pages default to 50 and cap at 100. Queries can
  filter names by literal NFC/case-insensitive substring, preserving accents.
- The private `readImportPackOrganizationCatalog` worker command returns 100-row
  pages under a complete catalog token. It reads existing entity identities/names
  and active Instrument/Genre vocabulary mappings transactionally, with 10,000 rows
  per catalog dimension/vocabulary and an 8-MiB complete catalog ceiling. Main rejects
  incomplete, duplicate or mixed-token pages. No managed paths or renderer-supplied
  files participate in the command.
- `setPackOrganization` replaces one new Pack's complete explicit selection under
  its current revision/root/catalog reference. Instruments/Genres select existing
  identities only; offered vocabulary can still be accepted through Classification.
  Author names use the domain's trimmed NFC, 1–120-code-point policy. The request
  accepts at most 100 choices per dimension and 480 UTF-16 units per raw credit name;
  all organization drafts together cap serialized content at 4 MiB. Unknown fields
  and duplicate identities reject atomically without replacing prior drafts.
- New Authors receive main-owned preparation-local `draftId`s, not reserved catalog
  UUIDs. An explicitly referenced draft can be reused by several new Packs. Unknown
  draft IDs and silent renames reject. Creating another Author with a matching name
  requires the exact current catalog homonym IDs in `acknowledgedAuthorIds` and any
  already retained matching draft IDs in `acknowledgedDraftIds`. Catalog matching
  uses the domain name policy (case/outer-space insensitive NFC, preserving accents
  and internal spacing). More than 100 required matches block rather than truncate.
  Pending-draft acknowledgments document the explicit duplicate-creation warning,
  not execution dependencies; they never merge identities. Independent homonymous
  drafts are created in separate reviewed steps so their IDs are consultable first.
- `clearPackOrganization` explicitly drops a root's manual choices. Root removal
  drops only that root's references; rescans and mode switches retain entered drafts.
  Standalone mode never executes or seals those inactive Pack intents. New Authors
  shared by surviving drafts keep their temporary identity; unreferenced drafts are
  not catalog records and cannot be reused through forged or expired handles.
- `review` reloads current catalog data and compares selected identities, names,
  mappings and acknowledged catalog homonyms. Renamed/deleted selections or newly
  matching Authors mark affected drafts `needsReview`, advance the revision once,
  revoke the seal and return `STALE_REVIEW`. Intended choices remain inspectable;
  explicit restaging with a fresh reference or clearing is required. Unrelated
  catalog changes do not require restaging unchanged selections. A source that has
  since become an existing Pack requires clearing unsupported new-Pack intents.
- With active organization drafts, the internal seal is `contractVersion: 3` and
  includes `organizationDigest`, plus `classificationDigest` when classification is
  enabled. It binds new-Author identities/names, explicit choices and duplicate
  acknowledgments, not consent to execute. Future per-target commits must resolve
  shared temporary Authors to actual identities atomically without merging by name.
- Manual Instruments/Genres take precedence over matching recognition suggestions
  for that Pack. Shared review snapshots carry explicit `draftAssignments`; matching
  rows are `draftAssigned`, not catalog `assigned`, and are not separately actionable.
  Shared draft exports retain those explicit intents without inventing path evidence.
  Clearing a manual choice makes its suggestion reviewable again. Manual Genres can
  supply dependency-bound Sample suggestions even when the Pack name contains no
  matching clue. Assignment still requires separate Sample acceptance; neither
  Instruments nor Author credits propagate to Samples or the local profile.

### Approved Root-Name Author Hints

Credit hints are a scoped addition to new-Pack import, not Author inference in the
general classification engine or any Sample workflow. Looking at hints writes
nothing and never preselects a credit or creates an Author draft.

- Match existing Author names as complete token phrases inside the selected root's
  own folder name, with NFC/case-boundary and equivalent separator normalization.
  There are no Author aliases, spelling guesses, provider catalogs or remote calls.
  Homonyms remain separate existing-identity offers with matched-name/root evidence.
- A valid prefix before the first whitespace-delimited hyphen, en dash or em dash
  in `Author - Pack name` can offer creation of that prefix as a new Author. Both
  prefix and remaining title must be nonempty. Invalid/overlong names are not
  truncated. A prefix already matching a known Author's complete normalized phrase
  offers existing identities rather than a redundant creation hint.
- Free titles with no clear delimiter only match known Authors. Unknown Authors
  can be entered manually; do not guess a boundary between an unknown credit and
  Pack title. Pack presentation edits and filenames/ancestor folders do not retarget
  these hints. Every credit still requires explicit selection or creation review.

Tests cover read-only catalog paging/worker dispatch, hints and homonyms, explicit
creation/reuse, atomic/stale requests, manual Genre dependencies, no Sample credit/
Instrument inheritance, preserved source audio/catalog serialization, rename/delete/
new-homonym review, root lifecycle and discard draining. Validation is local on
macOS; Windows, packaged Electron/UI/DAW behavior and full-capacity performance
remain unvalidated. No unconfirmed draft restart recovery is provided.

## Delivery Blocks and Next Work

Keep this sequence as the handoff reference; the technical proposal below owns
the target design, while each implemented block must document its actual scope.

1. **Read-only discovery/preparation — implemented internally.** Scope above;
   no selection editing, mode choice, decisions, confirmation, migrations, or UI.
2. **Selection and versioned review — core implemented internally; integration
   remains.** Scope above covers file/subtree selection, root removal/rescan,
   Pack/standalone mode, name/description drafts, explicit overlap destinations,
   individual origin decisions, revisions and paged selection/origin seals.
   Suggested classification now integrates through complete-scope spooled review.
   Explicit new-Pack assignment/credit drafts and scoped Author hints are implemented.
   Next deliver staged cover ownership without catalog writes. Do not treat this
   partial seal as confirmable.
3. **Durable confirmation and shared execution foundation — pending.** Resolve the
   shared operation state/storage API and migrations, immutable chunked plan
   publication, idempotent confirmation, queue-head revalidation, Needs review,
   exit guard and restart verification. Validate/tune whole-operation safety
   ceilings before exposing execution. No confirmed import without durable results.
4. **Reviewed root/Pack/Sample execution — pending.** Commit root registration and
   target outcomes; couple new Pack/first associated Sample atomically, then
   commit later Samples individually. Integrate classifications/credits and
   managed covers, stop/report failures without rollback claims, and implement
   historical/result-membership queries and whole-batch Retry. Decide/validate the
   proposed multiroot link migration before claiming grouped multiroot reimport.
5. **Electron bridge and reviewed import UI — pending.** Add authorized native
   multiselection, opaque handles, IPC/preload validation, owner/session lifecycle
   and orphan cleanup, wizard/review/progress/results with minimize/reopen, then
   switch the user-facing import path only when recovery guarantees are delivered.
   Preserve current preview/Favorites/native dragging and validate actual desktop
   workflows separately on macOS and Windows.

## Technical Delivery Contract — Proposed Target, Not Fully Implemented

This section translates the agreed workflow above into a concrete implementation
proposal. Command names, payloads, storage changes, and operational limits below
are design contracts to validate during delivery, except where the implemented
internal slice above explicitly records actual behavior. They are not existing
renderer APIs. This proposal does not
authorize implementing unrelated Pack UI or a general-purpose task framework.

### Current Code and Replacement Boundary

| Existing implementation                                         | Reuse or required change                                                                                                                                                                                        |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `services/library/library.ts`: `readAudioDir`, `discoverFolder` | Reuse supported extensions and containment rules; replace eager whole-folder arrays with bounded discovery and explicit scan outcomes. Validate symlink components and readability before accepting candidates. |
| `prepareLibraryPackImport`                                      | Do not expose as the reviewed preparation API: it calls `importFolder` before review. Keep existing callers working until the replacement is validated.                                                         |
| `db/operations/sources/import.ts`: `importFolder`               | Extract/reuse identity and source-observation rules, not its whole-folder transaction. It currently registers/reactivates roots, marks associations absent, and catalogs every eligible file.                   |
| `db/operations/packs/operations.ts`                             | Reuse origin-conflict rules, presentation validation, and review hashing. Replace the all-members `importPack` transaction with reviewed per-target commands.                                                   |
| `db/schema/packs.ts`                                            | `sourceRootId` is required and unique: the implemented relationship is one root per Pack and at most one Pack per root. Multiroot reimport cannot be claimed on this schema.                                    |
| `ipc/dialog.ts`                                                 | Existing folder selection returns one path. Reviewed import needs main-owned multiselection and opaque selected-root handles, not renderer-supplied paths.                                                      |
| `shared/ipc/result.ts`                                          | Reuse validated `IpcResult<T>` and existing error codes; preparation blockers and item failures need structured data in addition to an error envelope.                                                          |

The existing folder-browsing entry point remains unchanged while this work is
internal. Switching user-facing import to the new path requires its execution,
recovery, and result guarantees together; a preparatory service alone is not a
delivered Pack import.

### Ownership and Preparation Lifetime

- Main owns one import preparation per authorized window, its selected-root
  handles, canonical locations, discovery observations, and review revisions.
  Renderer sends handles/IDs and choices, never authoritative paths, source
  observations, hashes, or claimed commit results.
- A preparation has an opaque `preparationId` and monotonic `revision`. Root and
  candidate IDs are preparation-local, not future catalog Sample UUIDs. Existing
  candidates additionally expose their actual `sampleId` for review.
- Discovery and review perform read-only catalog queries. They do not register
  roots, create Samples/Packs/vocabulary, change origins, publish cover assets,
  update scan metadata, or grant audio preview/drag capabilities.
- Large discovery sets use a private session spool with bounded memory and paged
  reads, not full arrays over IPC. The spool is not a recoverable draft journal;
  discard, owner destruction, or restart invalidates its handles and schedules
  cleanup of Kiter-owned temporary files only. Closing the dialog alone retains
  the preparation. No time-based expiration silently discards an active draft.
- Cover selection is staged by an image-service handle. Validation may create a
  temporary managed copy, but publication/reference assignment belongs to confirmed
  execution. Preparation never changes an existing Pack cover.
- Preparation states are proposed as `discovering`, `blocked`, `editing`,
  `reviewed`, and `confirmed`. Any edit invalidates the confirmation token.
  Discard removes an unconfirmed preparation; it cannot cancel a confirmed import.

### Proposed IPC Surface

All invokes authorize the main-frame caller, validate named request schemas, and
return `IpcResult<T>`. Preload validates responses. List responses use pages of 50
by default, maximum 100. Every preparation mutation supplies its expected revision
and returns the new revision; stale revisions never overwrite newer choices.

| Channel                        | Request and result responsibility                                                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `imports:select-folders`       | Open native folder multiselection; return `{ canceled: true }` or `{ canceled: false, preparationId, revision }`. Adding folders to an existing preparation supplies its ID/revision. Native cancel leaves it unchanged.        |
| `imports:get-preparation`      | `{ preparationId }` returns revision, preparation state, totals, root summaries, blockers, and selection/conflict counts, without the candidate set.                                                                            |
| `imports:list-candidates`      | `{ preparationId, revision, rootId?, cursor?, limit? }` returns stable candidate IDs, names, relative source context, existing/new/excluded status, selected state, current origin, possible destination roots, and blockers.   |
| `imports:set-mode`             | `{ preparationId, revision, mode: 'standalone' \| 'pack' }`; recompute destinations/conflicts without writing catalog data. Pack mode does not mean arbitrary assignment to any existing Pack.                                  |
| `imports:set-selection`        | Apply bounded explicit candidate choices or an explicit reviewed subtree scope. Hidden candidates remain consultable. A subtree action targets the server-held snapshot, not only loaded rows.                                  |
| `imports:set-destinations`     | Bounded `{ candidateId, destinationRootId }` entries select one of that candidate's verified containing roots in Pack mode. Changing destination invalidates its old origin decision and dependent classification evidence.     |
| `imports:set-pack-details`     | Address a new-Pack root target and set name, description, staged cover, and explicit classification/credit choices. Existing-Pack presentation is read-only in import; edit it through Pack management instead.                 |
| `imports:set-origin-decisions` | Bounded `{ candidateId, destinationRootId, resolution: 'keep' \| 'assign' }` entries for individual conflicts; reject duplicate, unrelated, or nonexistent candidates. Choosing a destination root for overlap is explicit too. |
| `imports:rescan-root`          | Rediscover an affected root; preserve entered presentation, invalidate affected file selection/origin review, and return refreshed state. Removing a blocked root is an explicit preparation mutation.                          |
| `imports:remove-root`          | `{ preparationId, revision, rootId }` removes a selected scope and recomputes unique candidates/destinations. Candidates still present through another selected root remain; affected decisions require fresh review.           |
| `imports:review`               | Seal the current revision after validation; return a `reviewToken`, totals, and paged review references. Missing conflicts, incomplete scans, invalid metadata, or a new Pack with no prospective member block sealing.         |
| `imports:confirm`              | `{ preparationId, revision, reviewToken, confirmationId }` persists the immutable confirmed plan and returns `{ operationId }`, not a list of Samples or a success claim.                                                       |
| `imports:discard`              | `{ preparationId, revision }` explicitly releases an unconfirmed preparation and staged resources.                                                                                                                              |
| `imports:list-results`         | `{ operationId, rootId?, outcome?, cursor?, limit? }` returns historical per-root/per-target outcomes and current record survival separately.                                                                                   |
| `imports:list-result-samples`  | `{ operationId, rootId?, cursor?, limit? }` returns bounded current Samples backed by successful execution-time inclusions, including unchanged existing Samples. Deleted history returns unavailable, not a cached result.     |

Classification proposal paging/staging composes with the owning Classification
contract; import must not invent a second acceptance/rejection protocol. Likewise,
operation status, remove-pending, progress subscription, history cleanup, and
restart continuation belong to the shared execution API. Progress events contain
operation ID, increasing sequence, stage and counts; after reconnect or a sequence
gap the renderer queries authoritative status instead of reconstructing outcomes
from events. Subscriptions return an unsubscribe function.

### Candidate Identity, Overlap, and Root Associations

- Deduplicate by main-verified exact canonical location across all selected roots.
  Do not lowercase paths as an identity shortcut, deduplicate by hash/name, or
  treat size/mtime equality as proof of equal content. Use Node path utilities
  and platform-aware filesystem checks on macOS and Windows.
- A unique candidate contains all selected containing-root occurrences. Selection
  applies to the file once; Pack mode additionally requires one explicit
  destination root if multiple distinct Pack destinations apply. Never assign
  a Sample to two Packs or process a duplicate occurrence as a second Sample.
- Existing Sample lookup, exclusions, root registration state, root/Pack links,
  source revision, and manual-origin protection are read together in worker-owned
  bounded snapshot queries. Excluded sources remain blocked; import cannot clear
  their exclusions. Inactive registrations require the separate reviewed
  reactivation workflow, not `importFolder`'s implicit reactivation.
- Standalone mode preserves every existing origin. Pack mode automatically
  associates only eligible new/unprotected standalone Samples; another Pack or
  manually standalone origin requires exactly one keep/assign decision. An
  already matching manual origin stays manual. A kept conflict can still count
  as successfully included in import results without becoming a Pack member.
- Only selected successful candidates gain/refresh discovery associations for the
  reviewed selected containing roots. Unchecked existing Samples keep their
  current source observations and associations. Do not blanket-mark a root's
  associations absent using the checked subset. Recording a completed discovery
  separately must not imply that all discovered files were imported or that a
  missing source's identity/memberships were removed.
- Proposed multiroot representation: replace `packs.sourceRootId` as the sole
  authority with `pack_source_roots(pack_id, source_root_id)`, unique on
  `source_root_id`, with restrictive root/Pack foreign keys. Backfill every
  existing link without changing IDs, locations, origins, or presentation. Pack
  reads expose bounded root context instead of silently choosing a primary root.
  A new Pack still starts with one selected root. This does not authorize UI for
  attaching arbitrary roots, merging Packs, or inferring links from overlapping
  paths. Group selected roots into one reimport only if persisted links already
  identify the same Pack; otherwise keep separate targets.
- Validate that representation and its migration before implementing multiroot
  reimport. If deferred, explicitly block the unsupported grouped case rather
  than deriving a second link or another Pack implicitly. Folder relocation must
  eventually preserve link and root IDs under Catalog Organization's contract.

### Review and Revalidation

The server-held sealed review binds the exact selected candidate set and order,
root occurrences/destinations, complete-discovery snapshot, new-Pack presentation,
staged asset identity, existing Pack/root associations, candidate existence/source
observations/revisions/origins, exclusions, and staged classification decisions.
Tokens are opaque reviewed-state evidence, not authentication or audio access.
Serialize with an explicit contract version and deterministic ordering; never hash
only totals or a visible page. Hash/read batches are at most 500 rows.

- `reviewToken` binds the preparation revision and exact plan; worker target-state
  tokens bind catalog facts needed by each transaction. Filesystem observations
  are verified by main, never by accepting a renderer token as filesystem proof.
- Revalidate when reopening review, confirming, reaching the queue head, and before
  each target write. Check supported extension, readability, symlink components,
  unchanged canonical containment and observed file state. There is no atomic
  filesystem/SQLite snapshot; recheck as close to the transaction as possible and
  do not claim content verification from stat data.
- A changed root/discovery/origin invalidates the dependent review and requires
  the affected rediscovery/selection/origin review under the workflow above.
  Unrelated Favorite or Collection edits do not invalidate import. Classification
  uses its own relevant-state rules, including saved type replacement checks.
- Before execution, stale queued plans enter shared Needs review and block queue
  advancement. After execution starts, a failed target revalidation stops the
  batch and records failed/unprocessed work; committed targets stay committed.
  Whole-batch Retry prepares a new operation. Never replay an old origin decision
  against a changed Sample or roll back earlier successes.
- Queue-head and per-target checks compare the expected state after this
  operation's own verified prior commits, not the initial whole-plan hash. Shared
  vocabulary/root writes must not make the operation invalidate itself.

### Confirmation, Transactions, and Durable Evidence

- `confirmationId` is a client-generated UUID scoped to its preparation and sealed
  revision. Main/worker enforce uniqueness: repeated confirmation of the same
  seal returns the same operation ID; reuse with different content is rejected.
  An uncertain IPC response must not create duplicate queued work on retry.
- Persist the entire immutable versioned plan, ordering, reviewed decisions,
  target dependencies and new-entity ID reservations before publishing the
  operation as queued. Large plans transfer in validated bounded chunks to
  worker staging; a final transaction publishes a complete plan or none. An
  incomplete staging attempt is never executable or reported as a confirmed
  operation and must be reconciled/cleaned without touching catalog data.
- Confirmation itself changes no Samples, roots, origins, or Pack presentation.
  Main executes targets serially in reviewed root order and deterministic
  canonical-path/candidate-ID order. Overlap executes once at its reviewed
  destination. A new Pack's first associating candidate is identified in review
  and executes first for that Pack; remaining candidates keep their stable order.
- A new root's registration and operation-step outcome commit before dependent
  catalog targets, after revalidation. Registration can survive a later failure;
  show that separately from imported Samples. Existing registrations are reused,
  never reset/reactivated implicitly. No unselected audio is cataloged by root
  registration, and subsequent source access still needs normal authorization.
- New Pack: its presentation, ready managed-cover reference, classifications/
  credits, first origin association, required new Sample/source/root associations,
  and Pack/Sample outcomes commit in one immediate worker transaction. If the
  first candidate is existing, reuse its UUID and recheck its reviewed origin.
  Failure creates no empty Pack and rolls back that target's catalog writes.
- Existing Pack: preserve name/description/cover. Commit its explicitly reviewed
  classification/credit decisions and Pack outcome before dependent Samples.
  Even unchanged targets record a verified inclusion/checkpoint. Failure blocks
  its Samples and stops the batch. Later Sample failure does not undo that Pack.
- Each subsequent selected Sample commits new/reused identity, source observation
  and revision changes, selected-root associations, explicit origin resolution,
  classification/type/rejection decisions, and its result membership/outcome in
  one immediate transaction. Unexpected identity/exclusion/origin changes reject
  the write rather than merging or silently adopting the new state.
- Immutable image publication remains coordinated outside SQLite through the
  existing managed-image service. Failure preserves the previous reference;
  unpublished/unreferenced copies use recoverable cleanup. No filesystem rollback
  or atomic image/database promise is added.
- Stop on the first execution failure; start no later target/root. A rolled-back
  target's failure is recorded separately, with remaining targets unprocessed.
  If failure recording itself fails, recovery marks uncertainty instead of
  inventing failure/success. Confirmed import has no cancel command.

### Persistence and Result Queries

Storage needs committed migrations; do not edit old migrations or reset catalogs.
Keep schema row types private and implement these responsibilities incrementally:

| Record responsibility            | Required durable information                                                                                                                                                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared operation header          | Contract version, type, confirmation identity, queue sequence, lifecycle/recovery status and timestamps, under Operation Execution.                                                                                                            |
| Import roots/targets             | Original selected-root scope, existing/new identities, stable execution ordinal, reviewed source/destination/origin decisions, classifications and dependencies. Historical source context is local producer data, not diagnostic log content. |
| Transaction checkpoints/outcomes | Root registration, Pack stage, and Sample stage outcomes coupled to their actual commits; failed and unprocessed reasons; created/updated/unchanged distinctions.                                                                              |
| Successful inclusion membership  | Unique operation/Sample inclusion and per-root links derived from successful selected targets, independent of current Pack membership. Preserve historical identity snapshots if catalog entities are later deleted.                           |
| Pack/root links                  | Reviewed association migration described above, if multiroot delivery is enabled.                                                                                                                                                              |

Use indexed operation/root/ordinal and operation/Sample lookups. Paginate immutable
historical outcomes by execution ordinal with a stable tie-breaker. Result Sample
queries resolve surviving current catalog rows using the normal library query
and main's normal audio authorization; historical membership is not permission
to read an arbitrary path. Deleting/reassigning a Sample later does not rewrite
execution history. Separate included-at-execution, currently surviving, and
currently accessible totals. Do not count unchecked, failed, or unprocessed files
as imported; a Pack-stage success alone does not prove Sample inclusion.

On restart, verify checkpoints and coupled outcome records before exposing Retry.
Queued operations require explicit user continuation and full revalidation;
interrupted imports never auto-resume. Original interrupted results remain
immutable; import Retry rediscovers the entire original batch into a new
preparation, preserving surviving identities and obtaining fresh review. Source
paths from history are not new selection capabilities: reacquire/verify scope in
main. Shared retention, verification state, exit guards and queue advancement stay
owned by Operation Execution.

### Boundedness and Delivery Gates

- Candidate/result pages are 50/default, 100/max; staged explicit choices use at
  most 100 entries per request. Internal snapshot/hash processing uses at most
  500 rows per batch. Do not transfer the whole candidate/decision set in confirm.
- A preparation revision pins all cursor pages. Changed revisions reject stale
  cursors. Subtree selection/review sealing may run as asynchronous preparation
  work; return progress handles rather than blocking the main event loop.
- Whole-operation root/candidate limits, spool-byte limits, outstanding preparation
  work, and shared confirmed-queue capacity must be explicit validated constants
  with visible errors before implementation is accepted. Set their values after
  representative-library measurements; these page sizes are not scalability
  evidence. Exceeding a limit never silently truncates discovery or review.
- Implement in dependency order: read-only discovery/snapshot preparation;
  versioned review and selection; worker journal/confirmation; root/Pack/Sample
  target transactions and reconciliation; IPC/preload; then reviewed import UI.
  Do not expose a user-facing execution path before durable outcomes/recovery.
- Delivery coverage must prove: cancel/discard writes no catalog data; unchecked
  files stay unregistered; overlaps reuse one identity; exclusions/manual origins
  survive; new Pack/first member rolls back together; reimport preserves edited
  presentation; changed state blocks stale decisions; duplicate confirmation
  queues once; mid-batch failure retains only actual commits; restart verifies
  outcomes without replay; result inclusion survives origin changes; deleted
  history invalidates its links; no import changes original audio. Validate IPC
  authorization, image cleanup, and real Electron restart behavior as applicable.
- Validate filesystem selection/containment on macOS and Windows separately.
  Passing mocks or documentation review does not establish platform, packaged
  app, performance, or actual DAW support.

Before coding confirmed execution, resolve the multiroot migration proposal,
classification decision serialization, shared operation state/storage API, and
measured whole-operation limits. These remain delivery gates rather than reasons
to expose the old write-before-confirm preparation as the agreed workflow.
