# Catalog Organization

Read when changing catalog removal/reinclusion, Collection membership/order,
Category/Author detail assignments, source relinking, or manual origin correction. These are agreed
planned interactions; internal operations exist only as described in
[Data Access](../data-access.md). [Domain Model](../domain-model.md) owns entity
lifecycle/invariants; [UI Patterns](../ui-patterns.md) owns drafts/forms and
[UX Design](../ux-design.md) owns selection/navigation. Visual design is deferred.

## Catalog Removal and Reinclusion

### Implemented Internal Contracts

The current worker/client operations are narrower than the planned UI below:

- Collection/member pages default to 50, maximum 100; Collections sort by stored
  name/UUID, memberships by position. Existing append is idempotent without moving
  members, new members append, removal may leave gaps. Full reorder supplies each
  current Sample ID exactly once and writes contiguous positions atomically,
  rejecting stale/incomplete sequences without changing prior order.
- Internal Author/Category and target-assignment pages use 50, maximum 100,
  normalized name key/UUID order. Partial search is literal, locale-independent,
  accent-preserving. Sample/Pack uses paginate separately and removal review
  includes counts/profile link. This is not global-search matching.
- Pack removal reviews presentation, cover, exact origins and Category/Author
  assignments, rechecking transactionally with `STALE_REVIEW` on change. Detached
  Samples gain manual standalone protection. Only unreferenced covers become
  `cleanup_pending`, with separate physical cleanup.
- Collection deletion rechecks review token, presentation, cover, exact ordered
  memberships transactionally, returning `STALE_REVIEW` on change. Final image
  reference cleanup checks all Packs/Collections/profile avatars and delegates
  physical cleanup recoverably to main's managed-image service.
- Sample removal review hashes presentation, Favorite/origin, source observation/
  revision, and exact Collection/Category/Author/root references in 500-item
  batches. Reference reads use UUID pages of 50, maximum 100. Immediate transaction
  rechecks token; exclusion/deletion commit together, stale state rejects, and
  internal APIs grant no audio authorization.
- Exclusions list by canonical path, 50/default and 100/max. Reinclusion's main
  checks enforce readable supported-extension audio, no symlinks or canonical
  path change. Transaction rechecks exclusion, registered containment, vacancy,
  then clears exclusion and creates new manually standalone Sample/source under
  chosen root. Other overlapping associations await rescan.
- Author/Category removal rechecks impact token, entity name, exact Sample/Pack
  IDs and profile link transactionally, rejecting `STALE_REVIEW`. Counts alone
  do not establish unchanged impact. Tokens prove reviewed state, not UI consent
  or authorization. Genre/aliases are future extensions, not current operations.

### Reviewed Workflow — Planned

- In Collection menus distinguish Remove from Collection (membership only) from
  Remove from Library. Membership removal is immediate without confirmation or
  promised Undo; preserve Sample, source, Favorites, and other organization.
  Process individual/batch items independently, continue after failures, report
  outcomes, and allow revalidated failed-only retry.
- Sample catalog removal requires explicit impact review/confirmation. Show every
  Sample and references visibly, including checked items hidden by filters;
  aggregate counts supplement them. Explain lost catalog organization and the
  location exclusion preventing automatic reimport. Preserve source audio.
- Excluded files is one destination from Samples secondary actions and Settings
  → Library, separate from catalog; exact route is open.
- Individual/batch reinclusion requires availability review and confirmation.
  It creates new standalone identities, not old Favorites, notes, origins, or
  organization. Main verifies readable supported audio under a registered
  containing root under domain rules. If several roots qualify, suggest most
  specific, show it, and allow another valid root.
- Reinclusion and batch removal continue after individual failures; report
  successful, failed, and unprocessed scopes distinctly. Retry failed targets
  after revalidation and reconfirm when impact/scope changes.
- Pack/Collection/Category/Author deletion uses brief review of name, consequences,
  counts, consultable details, and specific confirmation, without typed names.
  Preserve Samples/audio under domain lifecycle rules; Author impact includes
  clearing any profile link. Genre/alias impact follows its domain/feature contract.
- Stale impact closes the old review, explains the change, and requires restarting
  review. Dirty inspector drafts resolve Save/Discard/Stay before preparing removal.
- Playing/paused removal and lost playback contexts obey
  [Playback](playback.md#removal-interactions), including Stop preview within review.
- After deleting an entity from its own detail navigate to its list and report
  result. History reaching a deleted detail shows unavailable with recovery links.
  Batch IPC/reinclusion UI are not implied by existing worker operations.

## Implemented Single-Sample Category Editor

Sample Info exposes Edit categories alongside classification suggestions. It
opens a compact, anchored editor with a search field, paginated existing
Categories, multiple selection, removable selected items, and Save/Cancel.
The editor uses a native modal dialog with a transparent backdrop as its
popover container: the Sample remains visible, while underlying navigation,
selection, suggestions, and player controls are temporarily unavailable.
Outside clicks do not dismiss it. Escape and Cancel protect dirty edits with
Save and close, Discard changes, and Stay; focus returns to Edit categories.
Cmd/Ctrl+Enter saves. Native window close/application quit similarly offers
Save and quit, Discard and quit, or Stay, waiting for pending writes.
The primary UI Popover owns that surface's position, focus and dismissal;
the feature's EditorPopover retains Save/Cancel, dirty review and exit protection.

- Changes remain a local draft until one atomic Save. Empty selection clears
  direct assignments, without deleting Categories, changing Pack assignments,
  remembering rejections, or modifying audio or other Sample organization.
- React Hook Form owns selected Category IDs and dirty tracking, with a Zod
  resolver reusing the shared selection schema. Zod validates read/save requests
  at the IPC and worker boundaries as well; DB state checks remain transactional.
  The renderer's `features/classification/schemas.ts` derives the form schema
  from `shared/features/classification/schemas.ts`, which owns the request rules.
- `categories:read-sample` returns the Sample's current Categories and a read-state
  token. `categories:save-sample` validates the Sample, unique Category identities,
  and the current saved assignment/name snapshot in an immediate worker transaction.
  Changed assignments or renamed/deleted saved Categories reject with STALE_REVIEW.
  A missing selected Category rejects without partial replacement.
- Errors preserve the draft. A failed or uncertain save requires Reload saved
  categories before retry; this refreshes the token and shows current saved values
  while preserving the intended selection for explicit comparison and correction.
- Category search reuses literal normalized catalog matching, pages of 50, with
  stale responses ignored. This first editor accepts at most 1,000 assignments
  per Sample and fails explicitly above that limit; it does not truncate data.
- Successful Save refreshes classification suggestions. Removing an assignment
  may offer it again from unchanged evidence. Category creation, manual editing
  of other fields, and multi-Sample editing remain later slices. Future metadata
  fields join the shared atomic inspector draft under UI Patterns.

## Implemented Single-Sample Genre Editor

Sample Info also exposes Edit genres. It reuses the Category editor's anchored
modal popover, React Hook Form draft, Zod validation, bounded search, focus,
Save/Cancel, dirty dismissal/exit protection, and preserved-draft reload behavior.
Only one classification editor opens at a time; suggestion writes remain disabled
until it closes. Categories and Genres are separate short metadata drafts in this
prototype, not a combined multi-field inspector Save.

- `genres:list` exposes the existing literal normalized Genre query with pages of
  50, maximum 100. Search and pagination retain checked choices across pages.
- `genres:read-sample` returns the Sample's direct Genres and read-state token;
  `genres:save-sample` validates unique IDs and replaces only that Sample's Genre
  assignments in one immediate worker transaction. Empty selection clears them.
  The editor accepts at most 1,000 assignments and rejects larger scopes explicitly.
- The token covers Sample identity and saved Genre identities/names. Changed
  assignments or renamed/deleted saved Genres require fresh review; missing
  selected Genres or late failures roll back every assignment change.
- Category assignments, Sample type, credits, origin, Favorites, sources, and Pack
  Genre assignments are preserved. There is no inheritance or implicit rejection.
  Successful Save refreshes suggestions. Genre creation/rename/deletion UI and
  multi-Sample assignment remain later slices.
- `ClassificationEditor` and its hook own the shared renderer behavior, with
  explicit Category/Genre bridge adapters. Form schemas stay in the feature's
  `schemas.ts` and derive their selection rules from shared schemas.

## Collection Membership and Ordering

- Add samples from individual menu, checked batch, Collection catalog picker, or
  internal dragging onto sidebar shortcut. Add references, not audio copies;
  do not change origin or Favorites.
- Picker searches/creates and selects multiple Collections. Apply destinations
  independently, continue failures, report per Collection, and retry failed ones.
- Creation returns to picker with new Collection selected rather than opening its
  detail. Add still needs confirmation; cancel does not delete the created entity.
- Existing memberships keep position and are skipped/count-reported. New members
  append in source-list order over the complete checked batch, including hidden
  Samples. Stable tie-breakers/unknown ordering require exact bounded queries.
- Normal manual list has dedicated reorder handles and keyboard Move actions,
  not a separate reorder mode. Save each movement; failure restores stored order.
  Stale sequence rejects/reloads and requires repeating the movement, never replay
  against another order. Reordering is separate from metadata Save/Cancel.
- Alternate display sorts (name, observed duration) never replace stored order.
  Reorder only in manual sort without filters/local search.
- Sidebar Collection shortcuts are alphabetical with duplicate-name disambiguation
  under [List Presentation](../ux-design.md#list-and-card-presentation--agreed).
- Internal Sample drag, Collection reorder, and native DAW drag have distinct
  targets/state. Name/waveform remains original single-file native export;
  dedicated row internal handle carries that row only. Do not assume combined
  internal/native sessions or multi-file DAW export.
- Multiple-selection bar batch-drag carries all checked Samples including hidden
  ones and shows count. Highlight sidebar destinations; dropping adds directly
  without a second confirmation and reports completion/existing members/failures.
- Retry with deleted Sample/Collection updates scope and requires confirmation of
  remaining targets/destinations, never name-based identity substitution.

## Pack, Category, and Author Views

- Pack detail prioritizes Samples under cover/name/description/Category/Author
  header, with contextual list filters/actions. Presentation uses inspector drafts.
- Category/Author detail uses direct Samples/Packs tabs with separate contexts,
  without inheriting from Sample origins. Labels navigate to entity detail;
  assignment editing has separate controls.
- Inspector supports Category/Author name, uses, and contextual actions via
  Save/Cancel; no additional fields without domain agreement.
- Detail-header Edit explicitly inspects page entity even if showing a member;
  resolve dirty draft first. Shared context restoration preserves that target.
- Add samples/Add packs selectors search and select multiple, confirm via Add,
  and Cancel leaves relationships unchanged. Already added entries remain visible
  and disabled. Process targets independently, continue/report failures, and retry
  failed targets; this is not the inspector's atomic metadata Save.
- Contextual individual/batch removal deletes only current direct assignment,
  without extra confirmation, continuing/reporting per-target failures and allowing
  failed-only retry. It never deletes the associated entities/files.
- Pack lists use explicit checkbox selection, independent inspected row, Select
  all/context clearing, and ordinary open behavior. This does not authorize batch
  Pack deletion or other unagreed actions.

## Source Relinking — Agreed Baseline, Not Implemented

Relinking repairs catalog source references after files were moved outside Kiter
or explicitly replaces a source. It does not move, rename, copy, or modify audio.
The business-decision round below is complete; technical contracts and visual
design remain to be delivered.

- Support locating one Sample's source file and locating a folder to review
  candidate sources for multiple Samples together. Neither action imports the
  candidates as new Samples before confirmation.
- For folder recovery, propose candidates only by the same relative path under
  the user-selected replacement folder. Do not broaden matching by filename,
  file characteristics, or content hash. Renamed or reorganized files can be
  resolved through individual relinking instead.
- Show proposed old/new locations for review before applying any relink. A
  relative-path match is a candidate, not proof of unchanged audio content.
- A selected candidate may differ from stored source observations. Show known
  differences and require explicit acceptance of that source replacement; do not
  claim verified content equality from matching size/mtime or relative paths.
- Confirmed relinking preserves the Sample ID and user organization, including
  Favorites, presentation edits, origin, Collection memberships, and direct
  classifications/credits. Invalidate prior derived analysis when the source is
  replaced; old measurements must not describe the newly selected source.
- Allow explicit Change source even when the current source is accessible. Review
  the current and proposed files and explain that the original stays untouched;
  this is source replacement, not automatic missing-file recovery.
- When recovering a whole registered source folder that moved, preserve its
  registration identity and Pack association while updating its reviewed location.
  Future Pack reimport must recognize that association, not create another Pack
  from the new path. Files without confirmed candidates remain unresolved; a root
  location update must not silently relink or authorize those files.
- For an individual destination outside registered roots, offer explicit review
  and confirmation to register its containing folder. Do not automatically import
  the other files in that folder. Selecting the file alone does not authorize
  silently registering the folder.
- Existing domain/storage safeguards still apply: no identity merging, no
  bypassing excluded locations or destinations occupied by another Sample, and
  no audio authorization based solely on a stored or renderer-supplied path.

### Folder Scope, Conflicts, and Review

- Allow recovery of a subfolder by choosing its old cataloged scope and a
  replacement folder. Match paths relative to that subfolder. Review registration
  of the destination as an independent source, reusing its registration if already
  present. Preserve the original source registration for remaining files. Partial
  recovery does not create another Pack or transfer the original Pack/root link;
  Samples retain their origins.
- Block relocation of a whole source registration to an already registered
  canonical destination. Do not consolidate registrations or Pack associations.
  Offer recovery of the Samples into the existing source through partial recovery
  review instead, preserving both registrations and their Pack associations.
- Unsupported-extension or unreadable candidates, symbolic links, excluded
  locations, and destinations occupied by another Sample are blocked with specific
  reasons. Two Samples cannot confirm the same canonical destination. Correct or
  deselect conflicting candidates; valid independent candidates may continue.
  Reinclusion and other catalog changes use their own workflows, not implicit
  merges, overwrites, or exclusion removal inside relinking.
- Start valid candidates selected. Known source differences require additional
  explicit acceptance, individually or for an explicit group showing every Sample
  and its differences. Selection or final batch confirmation alone does not count
  as accepting those differences.
- Revalidate before execution and each write. Invalidate only decisions affected
  by changed source or association state, preserving valid decisions. A changed
  shared folder/association invalidates every dependent candidate. Require fresh
  review for affected work; never apply stale decisions.

### Execution and Recovery — Agreed, Not Implemented

- Commit reviewed source registration/location changes before dependent Sample
  relinks, after revalidation. Persist those outcomes independently. Registration
  failure blocks its dependent Samples but does not stop independent destinations.
- Preserve committed registrations/location changes after cancellation or partial
  failure, even if no Sample finishes successfully. Report that outcome explicitly.
  Unresolved Samples keep their old source locations; neither changing a root nor
  retaining a historical association authorizes them through the new location.
  Reconcile successful Sample associations against current registered containment,
  including overlapping roots, without changing origin or Pack/root identity.
- Commit source changes per Sample. Continue after individual failures, preserving
  successful changes and reporting completed, failed, and unprocessed items.
  Retry failed items only after revalidation and renewed review when needed.
- Allow cancellation between Samples: finish the current transaction and start
  no further items. Cancellation does not undo completed changes.
- Persist confirmed work and verifiable item outcomes. After interruption, verify
  actual committed results before offering manual continuation of remaining work;
  never automatically resume or blindly replay completed relinks. Scheduling,
  ordinary exit, durable history, and continuation follow
  [Operation Execution](operation-execution.md), including verification of the
  separately committed source-registration changes.
- For a loaded Sample, apply the playback interaction in
  [Playback](playback.md#source-replacement-interactions--agreed-not-implemented).

### Source Registration Lifecycle — Agreed, Not Implemented

- Unregistering requires confirmation showing the folder and Samples that would
  lose authorized access through it. Preserve source registration identity,
  historical associations, Samples, Packs, and all user organization; never delete
  audio. Stop scanning that registration.
- Samples covered by another registered source retain access only after main's
  normal authorized-access verification. Others lose preview/drag authorization;
  stop active preview when confirming unregister if it loses access. Distinguish
  lack of authorization from missing or deleted audio. Apply the player's
  [authorization-loss behavior](playback.md#source-registration-access-changes--agreed-not-implemented).
- Reactivation reviews and verifies the location, reuses the registration and
  associations, and offers a separate optional scan without starting it
  automatically. Reactivation alone imports no new files and clears no exclusions
  or manual origin decisions. A moved location follows relinking review rather
  than silently changing paths during reactivation.

Exact source verification, revision tokens, bounded candidate queries, IPC,
association reconciliation, authorization, registration lifecycle commands, and
recovery records remain delivery contracts. Visual controls and routes require
design. These agreements do not establish implemented workflows.

## Manual Origin Correction

- Dedicated Change origin in Sample inspector chooses existing Pack/standalone,
  reviews/confirms independently of metadata Save. Resolve dirty drafts first,
  like the separate image workflow. Batch correction is outside this delivery.
- Review shows Sample, current and destination origin, preserves Favorites,
  Collection memberships/direct assignments, explains no audio move and future
  import protection. Disambiguate Packs by source context, not unique names.
- [Import](import.md) owns per-Sample keep/assign conflicts on reimport.

Remaining technical contracts include bounded append-order queries, combined
metadata saves, batch IPC, result queries, and integration with focus/history.
Entity CRUD availability in worker/client is not proof of delivered workflows.
