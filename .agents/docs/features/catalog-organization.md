# Catalog Organization

Read when changing catalog removal/reinclusion, Collection membership/order,
Category/Author detail assignments, or manual origin correction. These are agreed
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
