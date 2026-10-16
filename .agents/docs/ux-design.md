# UX Design

Read this guide when designing or changing the application shell, information
architecture, views, navigation, selection, playback interactions, or workflows.
It owns experience-level decisions and open design questions.

See [UI Patterns](ui-patterns.md) for reusable interaction conventions,
[Domain Model](domain-model.md) for entity semantics, and
[Architecture](architecture.md) for technical boundaries. Visual tokens,
typography, spacing, and component appearance belong to the design system;
its documentation location is still to be defined.

## Status and Reading Guide

The first functional UX baseline is agreed. The sections marked Agreed describe
the intended experience, not shipped capabilities or existing IPC contracts.
The current renderer still renders the folder-based Library directly, without a
router. The design system and visual specifications are in progress.

Use the feature sections for behavior and the final validation/implementation
checklist for remaining work. Routing remains a technical proposal. Musical
analysis requires its own domain design, and filename/subfolder classification
is explicitly deferred to the next PR.

- [Shell and destinations](#shell-and-destinations)
- [Selection and playback](#selection-and-playback)
- [Editing and library workflows](#editing-and-library-workflows)
- [Search and presentation](#search-and-presentation)
- [Feedback, results, and focus](#feedback-results-and-focus)
- [Conflicts and operation guarantees](#conflicts-and-operation-guarantees)
- [Persistence summary](#persistence-summary)
- [Routing proposal](#routing--proposed-technical-direction)
- [Next PR](#follow-up-for-the-next-pr--import-classification-suggestions)
- [Validation and implementation checklist](#validation-and-implementation-checklist)

## Shell and Destinations

### Application Shell — Agreed

The shell contains these persistent regions:

```text
Integrated window header
  Window controls | Back / Forward | Global search | Import | Profile menu

Sidebar | Route content | Optional contextual inspector

Permanent global player
```

- Integrate the application header visually with the window title bar, respecting
  native window controls and draggable regions on macOS and Windows.
- Keep Back/Forward, global search, Import, and the profile menu in the global
  header. The profile menu provides access to Profile and Settings.
- Each view owns its title, local filters, and contextual actions within the
  content area, below the global header.
- The sidebar contains primary destinations and personal Collection shortcuts.
  Keep its text labels visible in both compact and wide windows.
- The inspector can be opened and closed. It follows the selected Sample, Pack,
  Collection, Category, or Author and shows an empty state when nothing is selected.
  Profile also uses the inspector through its explicit Edit action.
- In wide windows, the inspector sits beside the content. In compact windows,
  it overlays the content while keeping the player accessible.
- The global player occupies a permanent bottom region, including an empty state
  when no Sample is loaded. Navigation must not unmount it or interrupt playback.
- Keep an operation indicator in the header for active imports and Recent results,
  as defined in Import History and Recent Results. It is a shell control, not a
  separate Activity destination.
- Give compact use beside a DAW and wide-window library browsing equal design
  priority.

### Destinations and Sidebar — Agreed

Home is the startup destination. The sidebar hierarchy is:

```text
Home

LIBRARY
  Samples
  Favorites
  Packs
  Collections

ORGANIZATION
  Categories
  Authors

YOUR COLLECTIONS
  All user Collections as direct shortcuts
```

- Samples is the library-wide Sample catalog. Source folders are filters within
  this view, rather than a separate primary destination.
- Favorites is a library-wide destination, not only a current-folder filter.
- Collections opens the complete Collection list and management actions.
  The separate personal group provides shortcuts to every Collection, rather
  than only pinned or recently used Collections.
- Keep primary destinations visible while Your collections scrolls independently,
  following Shell Sizing and Scrolling.
- Packs, Collections, Categories, and Authors each have a list and dedicated
  entity detail views for exploring their contents.
- Profile and Settings are separate destinations reached from the header menu.
  Profile concerns the local identity; Settings concerns application preferences.

### Home — Agreed Content

Home includes a library summary with counts and section links, recent imports,
recent Collections, and quick actions for importing audio/creating a Collection.

- Give the library summary the greatest prominence when the catalog has content.
  Exact layout and the relative order of the supporting blocks remain open.
- Recent imports shows content actually incorporated or updated: Packs and
  source-folder groups of Samples, including completed portions of partial
  batches. It is not a list of failed operations; those remain in import history.
  Reimports refresh content recency only for effective changes: new Samples,
  observed source changes, or confirmed origin changes. No-op imports remain in
  history without promoting content in Home.
- Opening a Collection detail or successfully editing its data/content updates
  its recency. Do not count failed edits as successful activity. Activity storage
  and queries still need implementation. Persist the latest qualifying activity
  per Collection across restarts; a full history of visits is not required.
- Hide recent links to deleted Packs or Collections. For imported Sample groups,
  reflect surviving catalog content and hide the group if none remains. Import
  history can retain the original result independently of current catalog state.
- With no Samples, prioritize Import, explain briefly that source audio stays in
  place, and keep Create Collection secondary. Empty Collections remain valid.

### Profile and Settings — Agreed

- Profile is a summary view for the single local identity, without login. Its
  Edit action opens the inspector for name and optional Author link, using the
  shared Save/Cancel and dirty-draft rules. Avatar uses the independent image
  workflow. Profile presentation and Author credits remain independent.
- The profile's Author selector supports searching existing Authors, creating
  one without leaving the form, and unlinking. Save confirms the link; creating
  an Author remains a separate completed action even if the profile draft is
  discarded, consistent with other assignment selectors.
- Settings is one page with Playback and Library groups, rather than internal
  section navigation. Playback includes the persistent preview-volume preference;
  Sample field visibility is an additional planned typed preference specified
  below. Its Settings placement, if any, remains to be designed.
- Library provides access to Excluded files and persistent import history. The
  global operation indicator remains a shortcut to active progress and recent
  results; no separate Activity destination in the header is agreed.
- Settings volume and player volume share one live preference. Apply volume
  immediately and persist on completing the adjustment, without Save/Cancel.
  If persistence fails, keep the audible level and report that it was not saved.
  This is an explicit exception to metadata-form draft behavior.
- Import-history retention and manual cleanup follow Import History and Recent
  Results; they do not remove catalog entities or source audio.
- These views and the required recency/history persistence are planned.
  Pending/failed preference-write feedback details still need visual design.

## Selection and Playback

### Selection, Opening, and History — Agreed

- In Pack, Collection, Category, and Author lists, a single click selects an
  element; double-click or Enter opens its dedicated view. Provide a visible
  Open action so opening does not depend on double-click.
- Selection can exist while the inspector is closed. Where supported, an open
  inspector follows selection without requiring navigation.
- Selection and the currently playing Sample remain independent. Sample-specific
  interactions are defined below.
- Use stable hierarchy breadcrumbs, such as Packs → Pack name, regardless of
  where the user opened the entity.
- Back/Forward follows actual navigation history. Opening a Pack from search and
  going Back returns to those search results, rather than always to Packs.
- Returning to a list preserves its filters, sort order, and scroll position.

### Sample Selection and Preview — Agreed

These conventions apply to Sample lists in Samples, Favorites, Packs, and
Collections. They describe intended behavior, not current implementation.

- Normal interaction selects one Sample. Multiple selection requires entering
  an explicit mode with checkboxes; it is not the default interaction mode.
- A Select action enters this mode. Only checkboxes change batch membership;
  clicking a row changes the inspected Sample independently, even if that Sample
  is not checked. Done exits the mode and clears the batch.
- Preserve checked Sample IDs across filtering, searching, and sorting within
  the same view. Show how many checked Samples are outside the current results.
  Navigating to another view exits multiple-selection mode and clears the batch.
- Clicking a Sample name starts its preview. Clicking the rest of its row
  selects it. Provide an explicit Play control as well.
- Clicking the name of the currently loaded Sample toggles pause/resume; if
  playback has ended, it starts again from the beginning. Pause/resume is not a
  new preview and does not recreate its sequence or reset playback modes.
- With the Sample list focused and no text editing active, arrow keys change
  selection, Enter previews the active Sample, and Space pauses/resumes the
  current player Sample independently of selection.
- When a preview ends, stop by default. Offer optional Loop and automatic advance
  controls. Without automatic advance, Loop repeats the current Sample. With
  automatic advance, Loop repeats the sequence; without Loop, the sequence stops
  at its end.
- Navigating away or changing filters, local search, or source-list sorting
  disables automatic advance while allowing the current audio to continue.
  Sequence and Loop behavior are specified in Global Player below.
- In multiple-selection mode, the inspector shows the independently active
  Sample, indicates the batch selection, and does not become a bulk metadata
  editor. The inspected Sample need not belong to the checked batch; batch
  actions target checked Samples, not the inspector's active Sample.
- Agreed batch actions are Add to Collection, removal from the catalog, and,
  within a Collection, membership removal, plus removal of the current direct
  assignment from Category/Author detail as specified below. Catalog removal
  requires impact review and explicit confirmation. Original audio files remain
  untouched. Other batch actions have not been agreed for this delivery.

Batch review must make hidden selected Samples explicit. Context restoration and
Select all follow the rules below.

### List Context and Selection Restoration — Agreed

- Back/Forward restores the destination's filters, search, sort, scroll, active
  individual selection, and inspector open/closed state. Restore an active
  element only if it still exists and is valid for that result. Do not resurrect
  discarded drafts or a checked batch cleared on leaving the view.
- In detail views, remember the inspector's explicit target as well: the page
  entity opened through Edit or a selected member. Restore that target rather
  than silently switching to the other. If the member no longer exists or is
  invalid for the context, leave the inspector empty; never restore discarded
  drafts. This target is part of session-only navigation context.
- If filtering or local search hides the active Sample, resolve its dirty draft
  before applying the transition, then clear individual selection and leave an
  open inspector empty. Do not select or preview the first result automatically.
  Checked batch membership remains independent and can contain hidden Samples.
- In multiple-selection mode, Select all covers every result matching the current
  filters and search, including unloaded pages. Communicate its total scope and
  resolve membership through bounded queries rather than eagerly loading the
  entire catalog into the renderer.
- Select all captures membership at the time it is invoked. New matching records
  are not automatically checked; selecting them requires another explicit action.
- If checked Samples are deleted from the catalog, remove those IDs from the
  batch and notify the user of the count removed. A missing or unreadable audio
  source is not equivalent to a deleted catalog identity. Revalidate action
  eligibility before execution.
- Each tab retains its own search, filters, and position during the session;
  switching tabs does not transfer incompatible filters between entity types.
  Also restore each tab's individual selection and inspector open/closed state,
  resolving dirty drafts before switching. Switching tabs exits multiple-selection
  mode and clears the departing batch; returning does not restore checked items.
- Context restoration is session-only. Restarting opens Home and initializes
  views with default contexts. This does not reset the separately agreed
  persistent preferences, Collection recency, or import history.

On history restoration, focus the selected row/card when valid; otherwise use
the nearest useful item or view heading if no results remain. The exact bounded
snapshot implementation for Select all still requires technical design.

### Global Player — Agreed

- Show the loaded Sample's name, Play/Pause, Previous/Next, Stop, volume, mute,
  position and observed duration, Favorite, and a Locate Sample action. Also
  provide the previously agreed Loop and automatic advance controls. Exact
  visual arrangement is a design-system decision.
- Stop halts playback and returns to the beginning while keeping the Sample
  loaded. Favorite acts on the loaded Sample, not the list selection. Locate
  navigates to that Sample in Samples without interrupting playback, resolving
  dirty drafts under the existing navigation rules.
- Use a seekable progress bar in the global player rather than a waveform.
  Provide keyboard-accessible seeking; distinguish unknown duration from a
  measured value. Waveforms can remain in other Sample surfaces.
- Persist preview volume under the existing Preferences contract. Mute is
  session-only; it is not a new persistent preference.
- Starting a preview from a list establishes a sequence over the entire filtered
  result in its displayed order, not only loaded pages. Resolve sequence entries
  with bounded queries rather than loading or decoding the whole result upfront.
  Previous/Next can traverse this sequence without automatic advance enabled.
- Previous/Next starts playback of the destination Sample even if the current
  Sample was paused. A new preview explicitly initiated from a list establishes
  a new sequence with Loop and automatic advance both off; transport movement
  within a sequence does not reset its modes.
- Navigation or changes to the originating list's filters, search, or sort disable
  automatic advance while the current audio continues. If Loop was repeating the
  sequence, disable Loop as well rather than silently turning it into single-Sample
  repetition. Retain the original sequence for manual Previous/Next traversal and
  identify its origin in the player. Starting another Sample from a list creates
  a new sequence; transport navigation does not implicitly re-enable advance.
- Previous always goes to the preceding Sample, regardless of elapsed playback
  time. Without sequence Loop, disable Previous at the first entry and Next at
  the last; with sequence Loop, allow wrapping to the opposite end.
- Retain the order established when the sequence started: later membership
  additions and reordering do not insert or rearrange entries. Skip entries no
  longer valid for the original context, and report when that context becomes
  unavailable. A bounded query strategy must preserve this snapshot behavior;
  ordinary mutable offset pagination alone does not establish that guarantee.
- Seeking while paused changes position without starting playback. Adjusting
  volume while muted removes mute. Activating mute preserves the volume level
  instead of saving zero over it.
- When the seek bar has focus, Left/Right uses a duration-relative step with a
  fine-adjustment alternative. Home/End seeks to the beginning/end when duration
  is known. Define the proportional step, bounds, and fine-adjustment gesture
  through interaction prototypes; never seek outside the valid duration.
- When advancing encounters an unplayable Sample, report the failure visibly and
  try the next entry. Bound skipping so an entirely unplayable sequence cannot
  cause an endless loop, including with sequence Loop enabled.
- Report skipped unplayable Samples through a local player indicator with
  expandable reasons, rather than global notices while that context is visible.
  If no entry is playable, stop traversal and keep a visible error state.
- If the sequence cannot be queried or has no valid entries, discard it, disable
  sequence transport/modes, and explain that another preview must start from a
  list. Keep current audio if its source remains usable; do not offer retry of
  the discarded sequence.
- On restart, attempt to restore the last catalog Sample paused at the beginning,
  without restoring position, sequence, mute, Loop, or automatic advance. Restore
  volume as agreed. Persist a stable Sample identity, never its temporary audio
  URL, and reauthorize its source through main before enabling preview. This is
  an additional planned playback-restoration contract beyond existing volume
  persistence. If the identity was deleted, use the empty player. If the Sample
  exists but its source is inaccessible, retain it as unavailable, with known
  reason, Locate and Check again actions, and no playback or native drag until
  main can authorize access again. Never treat an access failure as deletion.
- With no loaded catalog identity, show a discreet Choose a sample to preview
  empty state and disabled transport controls. An existing identity with an
  inaccessible source uses the unavailable state described above, not this state.

These are intended controls and interactions, not delivered player capabilities.
Sequence snapshot mechanics, proportional/fine seek gestures, and the last-Sample
restoration contract still need implementation design. Only volume persistence is
currently implemented internally; last-Sample restoration is a new requirement.

## Editing and Library Workflows

### Inspector Editing and Forms — Agreed

- Inspector fields edit a draft of catalog presentation data, not source files.
  Show explicit Save and Cancel controls when there are changes. Saving is not
  triggered by field blur.
- Category assignments and Author credits belong to the same draft as textual
  fields. Save confirms them together; Cancel discards their pending changes.
  Sample and Pack assignments remain independent. Save must commit the whole
  draft or none of it: invalid, failed, or stale fields/relationships preserve
  the draft without partially saving other fields. This requires a combined
  transactional command that does not yet exist.
- Before changing the inspected element, navigating away, or closing an inspector
  with unsaved changes, offer Save and continue, Discard and continue, or Stay.
  Save and continue performs the requested transition only after saving succeeds.
  On validation or storage failure, keep the draft and the editing context.
- Cancel asks for discard confirmation when there are unsaved changes. Confirming
  discards the draft and restores the last saved values.
- Covers and avatars use an independent image workflow: selection, preview, and
  explicit confirmation. They are not committed by the textual form's Save action.
  Resolve a dirty text draft through Save, Discard, or Stay before opening the
  image workflow. A confirmed image change is independent of later text edits.
- Validate fields on blur and validate the complete form on Save. After a field
  has an error, update its validation feedback while the user corrects it.
  Surface save failures without losing recoverable input. Validation rules come
  from domain contracts, not from visual design alone.
- Create Collections, Categories, and Authors through a short dialog requesting
  the minimum required data. On successful creation, open the entity's detail
  view to complete its information. Do not navigate or close as successful before
  creation completes. Pack import follows Import Workflow below.
- Creation dialogs support Escape to request dismissal; if dirty, ask before
  discarding. Clicking outside does not dismiss them. Restore focus on close.
- Cmd/Ctrl+Enter submits the focused form. Enter alone does not submit from text
  inputs and retains its control-specific behavior, including newlines in
  multiline fields and confirming selector choices.
- During a save, show Saving, prevent duplicate submission, and disable editing
  and transitions away from that form until the result is known. Existing playback
  continues; player interaction follows the active overlay's focus rules (a modal
  form still blocks the underlying player). On failure, restore editing with the
  draft intact.
- Category and Author assignment selectors allow creating a missing entity in a
  short dialog. On success, return to the selector and add the entity to the
  parent's draft instead of navigating to its detail. The entity itself has been
  created; discarding the parent's assignment draft does not undo that creation.
  Make this distinction clear in the flow.

These are intended editing conventions, not delivered forms or IPC operations.
Application-close rules are specified in Keyboard, Focus, and Overlays below.
Nested creation focus follows the rules in Keyboard, Focus, and Overlays.
Combined-save command contracts still require implementation design.

### Import Workflow — Agreed

- Import supports multiple selected source folders in one operation, including
  their subfolders. Catalog import does not move or modify original audio.
- Use a large step-based dialog for folder selection, discovery, review,
  confirmation, and results.
- Choose standalone Samples or Pack registration after discovery, with the
  discovered content available for review. One choice applies to the entire
  operation: standalone Samples for all roots, or one Pack per selected folder,
  with separate presentation data for each Pack. Subfolders do not automatically
  become separate Packs.
- Allow selecting which discovered audio files to import before confirmation.
  Start with all eligible files checked; allow unchecking files or subfolders and
  distinguish already cataloged files from new ones.
  Discovery and review must not catalog unchecked new files. The current internal
  Pack preparation catalogs Samples before Pack confirmation; it must be adapted
  or complemented before implementing this selection experience. Do not imply
  that canceling the current preparation rolls back cataloged Samples.
- For a new Pack, offer name, optional description, cover, Categories, and Authors
  within the workflow. Only the name is required, initially suggested from the
  folder name. Existing Pack reimport preserves stored presentation data.
- Permit overlapping selected roots with explicit review. Show each file once
  and require a root choice when inclusion affects its destination Pack. Reuse
  existing Sample identities; overlapping roots must not duplicate Samples.
- When actual registered associations identify several selected roots with the
  same existing Pack, group them into one Pack review, deduplicate Samples, and
  preserve its stored presentation. Do not infer Pack identity from matching
  names. This refines the new-import one-Pack-per-folder rule for reimports;
  compatibility with source-association contracts requires technical validation.
- Resolve origin conflicts individually for each Sample: explicitly keep the
  current origin or assign the destination Pack. Do not offer group decisions.
  Protect manual origin corrections and existing Pack origins under the domain
  review rules; do not reinterpret a standalone import as permission to clear
  an existing origin.
- Before import confirmation, closing the dialog retains its preparation for
  the current application session, including folders, selection, and entered
  data. Allow reopening it and revalidate before confirmation. This is not a
  promise of preparation recovery after application restart.
- After confirmation, allow minimizing progress and navigating elsewhere while
  the operation continues. Provide a global operation indicator and a way to
  reopen progress and results. Closing or minimizing the dialog must not imply
  cancellation of an executing import.
- While the import dialog is open, existing audio continues but the underlying
  player is not interactive. Minimize progress to use the player or other views;
  reopening progress restores focus confinement to the dialog.
- After successful import, show a result summary with choices to open the
  imported content or return to the previous view. Provide Open per root (Pack
  detail or Samples filtered by source root) and a combined view of Samples
  included in the operation, requiring an operation-specific query/filter.
  Result links must reflect actual completed outcomes, including partial results.

#### Execution, Failures, and Retries — Agreed

- Initially, do not offer cancellation after execution is confirmed. The user may
  minimize progress and continue working; this does not stop the import.
- If a folder fails during execution, stop the batch and do not begin subsequent
  folders. Preserve completed work and distinguish completed, failed, and not
  processed scopes. An interrupted batch is not a successful full import.
- An incomplete discovery blocks confirmation until the affected folder is
  successfully rescanned or explicitly removed. Do not commit incomplete scans
  or present partial discovery as a complete folder result.
- If reviewed sources, origins, or other relevant state change, prepare the
  affected folder again from discovery and review. Preserve its entered
  presentation data, but require a new content selection and conflict review.
- Retry prepares the entire original batch again rather than only failed or
  pending parts. Rediscover sources, recognize existing Samples and Packs, and
  present a fresh review before executing. Retry is not a blind replay and must
  not duplicate completed catalog identities.
- Allow preparing another import while one executes and placing it in a queue.
  Execute imports serially and revalidate queued preparations before execution.
  If revalidation requires new decisions, obtain a new review rather than
  applying stale decisions. After a batch fails, continue with the next queued
  operation, retaining the failed batch's result for inspection.
- Pending imports execute in arrival order. Allow removing a pending import;
  initially, do not offer reordering or editing of confirmed queued preparations.
  To change one, remove it and prepare another import.
- If no import is executing, allow application exit with confirmed pending
  operations and persist that queue. After restart, show the retained operations
  without automatically executing them; require revalidation before continuing.
  Unconfirmed preparation remains session-only and is not restored.
- If a queued operation needs fresh review, keep it in Needs review and pause
  queue advancement at that point. The user must review or remove it before
  later operations continue. This differs from execution failure, which stops
  that batch but allows the next queued operation to run.
- Prevent application exit while an import executes and explain that execution
  must finish first. Do not automatically quit afterward; the user may close
  Kiter again. Minimizing or hiding the window remains available. This exit guard
  does not guarantee completion through forced termination or OS shutdown.
- Keep a local persistent operation history so completed and failed import
  results remain available after restart. This requires new persistence and
  result queries; it is distinct from the session-only unconfirmed preparation.
  Do not clean history automatically initially, as specified in Profile and
  Settings.
- On restart after unexpected termination during execution, report the operation
  as Interrupted rather than assuming success or rollback. Distinguish confirmed
  committed outcomes from unverified states and offer preparation of the entire
  original batch again, with fresh review. Do not resume automatically.
- The combined operation view includes all successfully included Samples, even
  existing ones with no changes, and excludes failed or unchecked files. Separate
  created, updated, unchanged, and failed outcomes in the summary. Define stage
  completion precisely before implementing operation membership.
- Historical results retain what occurred at execution time while also indicating
  whether referenced identities still exist in the catalog. Links open current
  surviving identities; later origin changes do not rewrite the historical event.
- Show stages and a visible file-level progress/result list. Use percentages only
  when the total is known, and distinguish discovery from catalog completion and
  Pack registration. Report intermediate committed outcomes accurately if a
  later stage fails; per-folder atomicity is not yet defined.

The exact confirmation/commit boundary, manual history cleanup, interruption
reconciliation mechanics, and multi-root Pack association contracts require
implementation design. This workflow is planned; existing folder import and
internal Pack operations do not deliver it yet. Persistent queued preparations
are a new requirement alongside import history, not existing recovery support.

### Catalog Removal and Reinclusion — Agreed

- Within a Collection, put Remove from Collection and Remove from Library in
  the action menu as clearly distinct operations. The first removes memberships
  only, preserving Samples, Favorites, other organization, and original audio.
- Apply membership removal without a confirmation dialog or promised Undo.
  Reflect success only after the operation completes. This includes individual
  and batch membership removal. Process batch items independently, continue after
  individual failures, report results per Sample, and allow revalidated retries
  of failed membership removals.
- Sample catalog removal requires impact review and explicit confirmation. Show
  each Sample and its affected references visibly, with aggregate counts as
  supporting information. Include checked Samples hidden by filters in batch
  review. Preserve source audio; clearly explain the loss of catalog data and
  organization and the exclusion preventing automatic reimport of that location.
- Provide one Excluded files destination accessible both from a secondary action
  in Samples and from Settings → Library. It is separate from the normal catalog.
  Its exact route remains to be chosen.
- Support individual and batch reinclusion with availability review and explicit
  confirmation. Explain that reinclusion creates new standalone Sample identities
  without restoring deleted Favorites, notes, Pack origins, or other organization.
  Main must verify readable supported audio under a registered containing root,
  following the existing domain checks. Show successful, failed, and unprocessed
  outcomes distinctly; batch failure behavior is specified below.
- Pack, Collection, Category, and Author deletion share a brief review dialog:
  name, consequences, affected counts, consultable details, and an entity-specific
  confirmation button. Do not require typing the entity name.
- Follow the removal semantics in [Domain Model](domain-model.md#removal-and-deletion):
  Pack removal leaves its Samples standalone, Collection removal removes its
  memberships, and Category/Author removal removes assignments or credits.
  Author review also exposes any local profile link that will be cleared. These
  operations preserve Samples and original audio.
- If deletion rejects a stale impact review, close that review, explain that the
  state changed, and require restarting the removal action with a fresh review.
- If Sample catalog removal includes the currently playing Sample, require
  stopping its preview before confirmation. A failed removal leaves that Sample
  loaded in the player; do not automatically resume it. Successful removal must
  not leave playback or dragging authorized for the removed catalog identity.
- Provide a specific Stop preview action inside that removal review so the user
  can meet the stop requirement without dismissing the dialog. This is an
  explicit exception to dialogs not exposing player controls.
- Resolve a dirty inspector draft through Save, Discard, or Stay before preparing
  removal review for that element.
- Batch reinclusion continues after individual failures. Show results per file
  and allow preparing a revalidated retry of failed items. When several
  registered roots contain a file, propose the most specific root, display the
  choice during review, and allow changing it to another valid containing root.
- After deleting a Pack, Collection, Category, or Author from its own detail,
  navigate to that entity's list and report the result. If history later reaches
  a deleted detail route, show an unavailable state with recovery navigation.

These are planned interactions. Batch reinclusion, its IPC/UI, and the shared
Excluded files destination are not implied to exist. Removal batch failures and
playback interactions are specified in Conflicts and Destructive-Action Edge
Cases below. Reinclusion retries follow the non-import retry rules: revalidate
failed items, and obtain new confirmation if the reviewed scope changes.

### Collection Membership and Ordering — Agreed

- Support Add to Collection from an individual Sample's menu, the checked batch,
  an Add samples catalog picker within a Collection, and internal dragging onto
  a Collection shortcut in the sidebar. These actions add references, not audio
  copies, and do not change Sample origins or Favorites.
- The destination picker supports searching, creating a Collection, and choosing
  multiple Collections in one operation. Process destinations independently,
  continue after a destination fails, report outcomes per Collection, and allow
  retrying failed destinations.
- Creating from this picker is an exception to standard create-and-open-detail:
  return to the picker with the new Collection selected. Add still requires
  confirmation. Canceling the picker does not delete the newly created Collection.
- Skip memberships that already exist, preserve their current positions, and
  report how many Samples were already present. Append new memberships in the
  current source-list order applied to the complete checked batch, including
  hidden Samples. Use stable tie-breakers and explicit unknown-value ordering;
  exact query contracts still require implementation design.
- Reorder directly in the normal Collection list through a dedicated drag handle
  and keyboard-accessible Move actions. Do not require a separate Reorder mode.
- Save each completed movement. If saving fails, restore the last saved order and
  show the error. This direct ordering interaction is separate from the metadata
  form's Save/Cancel draft.
- Offer the stored manual order and alternative display sorts based on available
  data, such as name or observed duration. Alternative sorts do not replace the
  stored sequence. Reordering is available only in manual order with no filters
  or local search active.
- Order Collection shortcuts alphabetically in the sidebar. Collections may
  share names; use the disambiguation rules in List and Card Presentation without
  requiring unique names.
- Internal Collection drops, Collection reordering, and native dragging into a
  DAW need distinct gesture targets and state. Current native export supplies one
  original file per gesture; this agreement does not introduce multi-file native
  export or assume that native and internal drag sessions can be combined.
- Use a dedicated internal-drag handle per Sample; dragging its name or waveform
  remains native single-file export to the DAW. Collection reordering uses its
  own separate handle.
- In multiple-selection mode, provide a batch-drag control in the selection bar
  that carries all checked Samples, including hidden ones, with an explicit
  count. A row's internal-drag handle always carries only that row's Sample.
- Highlight a Collection shortcut as a drop destination. Dropping adds directly,
  without a second confirmation, and reports completion, existing memberships,
  or failure accurately.

These are intended interactions. Stale reorders follow the conflict rules below.
On membership retry, if a Sample or Collection was deleted, show the updated scope
and require confirmation of remaining Samples and destinations. Never substitute
identities by name. Exact sort contracts still need implementation design.

### Pack, Category, and Author Views — Agreed

- Pack detail prioritizes its Sample list. Its header shows cover, name,
  description, Categories, and Authors; the list below provides contextual filters
  and actions. Presentation editing follows the inspector's Save/Cancel rules.
- Category and Author details separate directly assigned Samples and Packs into
  tabs, each with its own search and filters. Do not include Samples merely
  because their origin Pack is assigned to the Category or Author.
- Category and Author labels on Samples or Packs navigate to the corresponding
  entity detail. Editing assignments uses separate controls, rather than
  overloading those navigation links.
- Extend the inspector to Categories and Authors: show name, usage summary, and
  contextual actions; allow name editing through Save/Cancel. Do not introduce
  additional entity fields without domain agreement.
- Correct a Sample's origin individually through a dedicated Change origin action
  in the inspector. Choose another existing Pack or standalone status, then
  review and confirm separately from the metadata form. Preserve manual origin
  corrections during future imports; never move or copy source audio.
- From Category and Author detail, provide Add samples and Add packs selectors
  with search and multiple selection. These actions create direct assignments;
  they do not propagate assignments between Packs and Samples. Report outcomes.
- An Edit action in the detail header opens the inspector for the page's entity,
  even if it was showing a selected member. Resolve dirty drafts through
  Save/Discard/Stay before switching its target.
- Assignment selectors prepare a selection and apply it with Add; Cancel makes
  no relationship changes. Show already assigned entities as visible, disabled
  entries labeled Already added.
- Adding assignments processes targets independently, continues after failures,
  reports results per target, and allows retrying failed targets. This is distinct
  from the inspector's combined Save draft.
- In Category/Author detail, offer contextual removal of that direct assignment
  individually and in batches for listed Samples or Packs. Apply without an
  additional confirmation and report the outcome. This removes only the current
  relationship, not the Category, Author, Sample, or Pack. Process elements
  independently, continue after failures, show results per element, and allow
  retrying failed removals.
- Pack lists use the same explicit multiple-selection conventions as Sample
  lists: Select enables checkboxes, checked membership is independent of the
  inspected row, and the same Select all and context-clearing rules apply.
  Preserve Pack opening behavior: single click selects, double-click or Enter
  opens, with a visible Open action. This does not imply batch Pack deletion or
  other unagreed actions outside contextual assignment removal.
- Resolve dirty metadata drafts through Save/Discard/Stay before opening Change
  origin, consistent with the independent image workflow.

These are planned views and interactions. Origin review and dirty-inspector
conflicts follow the rules below. Detailed reconciliation controls still need
design. Batch origin correction is outside the initial agreed scope.

## Search and Presentation

### Global Search — Agreed Interaction

- Show suggestions while the user types in the global header search.
- Search Samples, Packs, Collections, Categories, and Authors.
- Search entity names and Sample filenames/relative source paths, notes and
  descriptions, and related metadata. Samples match the names of their directly
  assigned Categories and Authors and their origin Pack's name, but not that
  Pack's Categories or Authors. Packs also match directly assigned Category and
  Author names. Collections, Categories, and Authors match their own text fields,
  not an expansion through their members or uses. Do not infer musical properties
  from audio.
- Match text case- and accent-insensitively, support substrings, and require all
  query words to match, potentially across different searchable fields. Also
  tolerate approximate spelling errors. Prioritize exact names, then name
  prefixes/substrings, other text or relation matches, and finally approximate
  matches. Explain non-obvious matching reasons. Approximation thresholds and
  deterministic ranking details need validation with real library examples;
  do not introduce recency weighting.
- Group a bounded set of suggestions by entity type, with access to all results.
- Allow opening a matching entity directly or opening a full results view.
- Present full results as a mixed list ordered by relevance, with entity-type
  filters and clear type identification.
- Activating a Sample suggestion navigates to Samples, locates and selects that
  Sample, and allows inspection without automatically starting playback. Clear
  the destination's local search and filters so the Sample is not hidden; Back
  preserves the prior navigation context.
- Locating a Sample from a suggestion or the player creates a history entry,
  including when already in Samples. Back restores the previous full context
  rather than losing the earlier Samples filters and selection.
- Sample rows in full results retain the agreed selection and preview behavior:
  clicking the name previews; selection alone does not start playback.

### Sample Filters — Agreed Scope

- In Samples and Favorites, offer filters for source roots, origin Pack or
  standalone Samples, direct Category assignments, direct Author credits, audio
  format, and observed duration.
- Do not implicitly inherit Sample classifications or credits from its Pack.
- Combine selected values within one filter group with OR (any selected value),
  and combine different groups with AND. Multiple selected Categories or Authors
  therefore require at least one direct match within each respective group.
- Apply each filter change immediately, display active filters as removable
  chips, and provide Clear all. No Apply step is needed.
- Local search uses the same searchable fields and relationship rules as global
  search for the listed entity type, constrained to the current view or tab.
  Update after a brief typing pause, keep field focus, reject stale responses,
  and never initiate preview from a query update.
- Duration filtering requires catalog-queryable observed data; the current
  browse-time waveform/player duration does not establish that capability.
  Unknown durations must remain distinguishable from measured values.
- A duration range initially excludes unknown durations. Provide an explicit
  option to include unknown durations alongside matching measured values.
- Duration uses optional minimum and maximum fields with clear units and inclusive
  endpoints. Either bound may be absent. Explain invalid values or inverted
  bounds without applying an invalid query; numeric limits and input formatting
  belong to the eventual metadata/query contract.
- Availability was not selected as an initial filter. Missing-source states must
  still be presented accurately when applicable.

Search and filters are planned. Approximation thresholds, ranking tie-breakers,
query timing, and numeric duration contracts need implementation design and
validation. These decisions do not imply that library-wide search or its required
queries are implemented.

### List and Card Presentation — Agreed

- Samples, Favorites, and Sample lists within Packs and Collections use rows,
  rather than an alternate card presentation.
- Wide Sample rows accommodate name, Play/Pause, Favorite, contextual menu,
  waveform, observed duration, format, origin Pack, direct Categories, direct
  Authors, and relative source path. Include selection and distinct drag controls
  where applicable. Limit inline relationship labels with access to the rest.
- BPM and musical key/scale are requested as additional Sample information in
  the design. They are not implemented metadata contracts or approved analyzer
  behavior. The agreed direction is a local analysis producing reviewable
  estimates, with user confirmation and manual editing kept distinct from the
  original estimate and its provenance. Represent tonality as tonic and mode,
  such as C minor or F♯ major; do not assume every Sample has a detectable tonal
  center. Exact vocabulary, confidence, unknown/not-applicable states, validation,
  and analyzer behavior require a separately scoped domain/analysis design.
  Follow [Availability and Analysis](domain-model.md#availability-and-analysis).
- Compact Sample rows prioritize name, waveform, and duration. Secondary data
  moves to supporting surfaces or the inspector while essential actions remain
  accessible. Exact responsive layout remains a visual-design decision.
- Packs and Collections use cover cards with a placeholder when no cover exists,
  name, and Sample count. Pack cards additionally show bounded direct Author and
  Category labels and source-folder context, rather than a description excerpt.
  Collection cards keep only the essential cover, name, and count, apart from
  secondary information needed to distinguish duplicate names.
  Categories and Authors use text cards with their names and usage counts,
  without introducing new image fields. Cards preserve the agreed distinction
  between selection and opening.
- Samples and Favorites initially sort alphabetically by display name, with a
  stable tie-breaker. Collections retain their manual sequence.
- Main Pack, Collection, Category, and Author lists also initially sort
  alphabetically by name. This does not change Collection membership order or
  Home's recency blocks.
- Offer a field-visibility menu for Sample rows. Initial scope is showing/hiding
  fields, not user-controlled column ordering or resizing. Share one configuration
  across Sample lists, allowing contextual omission of redundant information.
  Persist the configuration across restarts as a new typed presentation
  preference, separate from session-only navigation context. This extends planned
  Preferences beyond the implemented volume field; define its contract before
  implementation.
- Name, Play/Pause, and Favorite are mandatory Sample-row fields. Waveform,
  duration, and the other metadata fields can be hidden. Contextual selection,
  menu, and drag controls remain available when applicable. Compact priority for
  waveform/duration applies only when the user has chosen to show them.
- Initially select all agreed fields in the visibility preference, subject to
  contextual relevance, available capabilities, and responsive space. Selecting
  BPM/key in the design does not imply measured values or an implemented analyzer.
- If a selected field cannot fit, keep it checked in the visibility menu and
  explain that it is temporarily hidden for space. Restore it when space permits;
  responsive hiding must not rewrite the user's preference.
- When Sample names collide, keep secondary relative-path context visible beside
  the name even if the dedicated path field is hidden. Tooltip and inspector
  provide full source context; do not rely on hover alone for disambiguation.
- Distinguish same-named Packs through their source-folder context, expanding
  the displayed path context enough to identify the root. Full location remains
  available through accessible supporting information and detail.
- Distinguish same-named Collections in cards, selectors, and sidebar through a
  description excerpt when useful, otherwise creation date, with a stable short
  identity reference if ambiguity remains. Creation-date availability and short
  reference collision handling need implementation design; do not invent data.

These are planned presentation requirements. Musical metadata contracts and
analysis, typed preference contracts, exact responsive field priorities, and
deterministic duplicate-name disambiguation mechanics still need implementation
design.

### Shell Sizing and Scrolling — Agreed

- Target a minimum useful window size of 1024 × 680 logical pixels. This is a
  design target requiring prototype validation on macOS and Windows, not a
  validated or implemented minimum supported window size.
- Sidebar and wide-mode inspector widths are user-resizable within limits.
  Preserve readable sidebar labels and a useful central content width. Provide
  keyboard-accessible resizing; exact bounds and defaults remain open.
- Use a fixed window-width breakpoint to switch between side-by-side and overlay
  inspector modes, rather than deriving the mode from user-selected panel widths.
  Resizing limits must therefore prevent oversized panels from starving central
  content within each mode.
- Preserve user-adjusted panel widths during the current session only. Restarting
  returns to design defaults; do not introduce persistent width preferences.
- Keep the view title, filters, and column headers fixed while rows/cards scroll
  inside the content region. The global header and player remain fixed as agreed.
  Define compact header height and overflow so controls do not consume the list.
- Within the sidebar, Home, Library, and Organization stay visible; only Your
  collections scrolls. Validate its remaining height at the minimum window size.
- Determine exact default/minimum/maximum panel widths and the fixed breakpoint
  using prototypes with real content, rather than choosing provisional numbers.
- When a wide window shrinks before crossing the breakpoint, reduce the inspector
  first, then the sidebar, respecting minimum widths and central-content space.
  Keep preferred session widths separate from constrained rendered widths so
  enlarging the window can restore them. Validate that all minimums fit above
  the chosen breakpoint.
- The compact inspector is a bounded right-hand overlay, leaving some blocked
  content visible. It spans the workspace height between global header and
  player. Its exact width and interaction with sidebar space need prototyping.
- The inspector body scrolls independently. Keep title/close controls and the
  dirty form's Save/Cancel footer available without scrolling to the end.
- For detail headers with cover/description, let that presentation scroll away
  while retaining a compact title/actions header, filters, and column headers.
- Provide one Reset layout action to restore both sidebar and inspector widths
  to design defaults without changing filters or selection. Its shell placement
  remains to be designed.

Exact panel widths, breakpoint, overlay geometry, sticky-header composition, and
Reset layout placement remain to be validated through visual prototypes. These
are planned behaviors, not implemented window constraints.

## Feedback, Results, and Focus

### Feedback and Short Operations — Agreed

- Prefer local success feedback for everyday actions: update Favorite in its
  control and show Saved in the editing context. Use a toast when the outcome is
  otherwise easy to miss, such as removing a membership. Do not announce success
  before the operation completes.
- Present recoverable errors near their action when possible. If that context
  disappears, use a persistent global notice with access to relevant details.
  Field errors remain attached to their fields and recoverable drafts survive.
- Informational and success notices without required actions dismiss after a
  5-second initial interval, paused while hovered or focused. Validate that timing
  for accessibility. Errors and notices requiring action do not dismiss
  automatically.
- Partial batch outcomes produce a persistent summary with counts and View
  results. Open per-item results and supported retries on request, rather than
  automatically interrupting the current context with a results dialog.
- Keep non-import batch results for the current session. Closing a notice does
  not discard its detail: provide Recent results within the global operation
  indicator. Only import history has agreed cross-session persistence.
- Short batch operations show pending state in their initiating control/context,
  prevent duplicate submissions, and block only conflicting controls. If the
  user leaves that context, preserve access to the result. This does not override
  the metadata form's wait-before-leaving rule or the import workflow.
- Group notices by operation, updating its existing notice and counts where
  appropriate. Do not merge independent failures into an ambiguous success or
  erase one operation's failure with another operation's success.
- No-results views keep their search and active filter chips visible, explain
  the lack of matches, and offer targeted Clear filters or Clear search actions.
  Distinguish this state from an empty catalog, loading, and failed queries.
- On failed refresh, preserve the last valid list with an explicit update-failed
  notice and Retry. Do not imply that stale results are a successful response for
  newly requested criteria. Without a prior valid result, show a load-error state
  with Retry while retaining the requested filters/search.
- For non-import partial retries, revalidate and retry failed items only if the
  scope is unchanged. Changed scope or required impact review prompts a new
  confirmation. This does not change import Retry, which prepares the whole batch.
- Expanded errors show a clear explanation, affected elements, suggested next
  action, and a copyable error code or operation reference. Do not expose stack
  traces or internal payloads; follow the existing logging/privacy rules when
  constructing copied diagnostic text.
- Announce notices without stealing focus: success is nonintrusive, errors are
  announced as errors, and actions such as View results remain keyboard-accessible.
  Modal decisions follow dialog focus rules rather than toast behavior.
- Stale displayed query data may still support selection and individual actions
  if those actions validate current state; destructive operations always prepare
  a current impact review. Disable result-wide actions such as Select all until
  the relevant result query is valid again.

These conventions are planned. Session-result access and retention follow the
rules below; notice timing still requires accessibility validation.

### Import History and Recent Results — Agreed

- Settings → Library opens a dedicated import-history view with operations
  ordered by date, state filters, and details by folder/file. Back returns to the
  prior context. The exact route is a technical navigation contract to define.
- Allow selecting terminal historical operations and deleting their history
  records individually or in batches after confirmation. Exclude active and
  queued operations. Explain that history deletion does not remove Samples,
  Packs, or source audio; operation-specific result links depend on that history.
  No automatic import-history cleanup is introduced.
- An Interrupted operation becomes eligible for history deletion only after its
  state verification completes, distinguishing confirmed outcomes from anything
  still unverified. Completion of that check does not imply all outcomes can be
  proven or that the import succeeded. Do not delete a record while execution or
  recovery verification is active; normal history-deletion confirmation applies.
- If a history record is deleted while its detail or combined Sample result view
  is open, replace that surface with a Record deleted state, remove record-based
  actions, and offer Back to history. Do not keep presenting its cached membership
  as a valid operation query. Catalog Samples and Packs remain unchanged.
- The global operation indicator opens a dropdown with active operations and
  Recent results. Choosing a completed result opens a modal detail; closing it
  restores focus under the shared overlay rules. Import progress retains its
  previously agreed minimize/reopen behavior.
- Retain the latest 50 completed/closed non-import operation results for the
  session. Protect active operations and unreviewed failures from rotation; this
  protection may exceed the nominal 50-result limit. Clearly communicate that
  these results do not survive restart. Define compact storage and treatment of
  oversized per-item details during implementation.
- Opening a failed operation's detail marks the failure as reviewed for rotation.
  Merely closing its notice does not. Reviewed does not mean resolved, successful,
  or automatically retried; its result remains available until ordinary rotation.
- Reach the operation indicator through ordinary Tab navigation in the header,
  with F6 available to enter that region. Provide an accessible name and announce
  state changes without stealing focus. No dedicated results shortcut initially.

These are planned surfaces and retention rules. State-verification persistence,
history deletion, and reviewed-result tracking require implementation contracts.

### Keyboard, Focus, and Overlays — Agreed

- Selecting an element updates selection but does not open a closed inspector.
  Info or Edit explicitly opens it; while open, it follows selection under the
  dirty-draft rules.
- In compact mode, the inspector overlay blocks interaction with the underlying
  content while keeping the player available. Keyboard focus stays within the
  inspector and player rather than reaching covered content. This is not an
  ordinary full-window modal dialog; its accessibility implementation must
  reflect the actual available regions.
- Escape from the inspector requests closing in both wide and compact modes,
  unless an inner menu or selector consumes Escape first. Dirty drafts invoke
  Save/Discard/Stay. Restore focus to its opener or the selected list item.
- Clicking outside the compact inspector on the content area requests closing,
  with the same dirty-draft protection. Consume that first click; do not activate
  an underlying item. The player remains an interactive exception, not a
  click-outside dismissal target.
- Cmd/Ctrl+K focuses global search and opens suggestions without discarding a
  field draft. Actual navigation from a search result still resolves dirty drafts.
  In a modal dialog, do not open global search. From the compact inspector,
  request closing it, resolve any dirty draft, then focus search only if closing
  succeeds.
- F6 and Shift+F6 move between shell regions in forward/reverse order: header,
  sidebar, content, open inspector, and player. Respect active overlay boundaries;
  unavailable or blocked regions are not focus destinations.
- Creation, confirmation, and review dialogs confine focus and interaction to the
  dialog. Existing audio may continue, but the underlying player and its Space
  shortcut are unavailable until dismissal. Escape and outside-click behavior
  follow the agreed form rules where applicable. The removal review's explicit
  Stop preview action is an exception; import progress must be minimized to
  interact with the underlying player.
- If a panel/dialog opener no longer exists, focus the nearest useful list item;
  if none remains, focus the view heading or primary action rather than a removed
  node. Do not let F6 or other shell shortcuts bypass modal focus boundaries.
- On application exit with a dirty form, offer Save and quit, Discard and quit,
  or Stay. If a save is already pending, wait for its result before exiting;
  failures leave Kiter open with recoverable input. An executing import still
  takes precedence and prevents exit under the import rule.
- Escape closes only the innermost open menu, suggestion list, or selector layer
  and restores focus to that layer's control. It must not cascade into closing
  its parent dialog/inspector in the same key event. A later Escape can request
  closing the parent under its dirty-state rules. Explicit selector drafts must
  not be treated as committed simply because their popup closed.
- Successful creation from an assignment/destination selector returns to the
  selector and focuses the newly created, selected item, announcing that result.
  Canceling creation restores the prior selector query and selection and focuses
  its Create control. Nested creation never discards the parent's draft.
- If multiple independent drafts exist on exit, present one review listing them
  with Save all and quit, Discard all and quit, and Stay. Save all is not a
  cross-form transaction: if one fails, keep Kiter open, preserve failed drafts,
  and accurately distinguish forms already saved.
- On history navigation to a list, focus its restored active item when still
  valid, with the existing nearest-item/heading fallback if it is gone.
- Escape from global search suggestions without navigating returns focus to the
  control from which search was invoked, restoring text cursor position when
  possible. If that control is gone or now blocked, use a valid focus fallback.

These are planned behaviors. Focus utilities and accessible dialog layering
require implementation validation; visual design can refine the shared exit
review without changing these draft-preservation rules.

## Routing — Proposed Technical Direction

A React Router SPA inside the Electron renderer, with nested routes under a
persistent shell, was proposed. `createHashRouter` is the initial recommendation
for compatibility with packaged file-based loading. The router dependency and
configuration have not been introduced or explicitly finalized.

Keep this recommendation alongside the navigation proposal during planning.
Once adopted, document router configuration and technical state boundaries in
[Architecture](architecture.md), leaving the experience and destination map here.

The proposed route map corresponding to the agreed destinations is:

```text
/home
/samples
/favorites
/packs
/packs/:packId
/collections
/collections/:collectionId
/categories
/categories/:categoryId
/authors
/authors/:authorId
/search
/profile
/settings
```

Use stable catalog IDs for entity routes, not names or filesystem paths. The
proposed state boundary is navigation and navigable filters in the router,
shared playback state above changing views, and local selection/form state in
the owning view or component. Persistent catalog data and preferences remain
behind the typed preload API. Finalize route and state details when adopting
the router; route state does not replace catalog persistence.

## Conflicts and Operation Guarantees

### Conflicts and Destructive-Action Edge Cases — Agreed

- Batch Sample removal processes each reviewed Sample independently and continues
  after individual failures. Report removed and failed Samples separately; a
  stale item's removal still requires restarting its impact review. Never label
  the entire batch successful if some removals failed. This is planned
  orchestration, not a claim of existing batch IPC.
- A loaded but paused Sample does not require another Stop before removal. On
  successful removal, unload it from the player; on failure, keep it loaded and
  paused. A playing Sample still requires Stop preview before confirmation.
- Deleting the Pack or Collection that supplied the playback context keeps the
  current audio playing but releases the sequence, disables Previous/Next,
  automatic advance, and sequence Loop, and explains that the context no longer
  exists. It does not delete the surviving Samples.
- If independent changes affect assignments in an open inspector draft, keep
  recoverable edits and show the conflict. Do not allow Save to overwrite the
  changed fields silently: require reviewing/reconciling affected fields or
  discarding the draft. Unchanged clean inspectors can refresh normally.
- Reconcile conflicts by affected field: show the current saved value and the
  draft proposal, let the user choose which to keep, and preserve unrelated draft
  edits. Revalidate the reconciled draft before the all-or-nothing Save; resolving
  a displayed conflict does not bypass command-level stale-state checks.
- If a Collection reorder is based on a stale sequence, reject that movement,
  reload the current stored order, and let the user repeat it. Do not silently
  replay the move against a different sequence.
- Individual Change origin review shows the Sample, current origin, and chosen
  Pack or standalone destination. State that Favorites, Collection memberships,
  and direct assignments remain, source audio does not move, and the manual
  correction is protected on future imports. Disambiguate destination names
  using the existing Pack identity rules.

Visual reconciliation controls and command-level stale-state checks still need
design and implementation. These agreements do not turn the combined metadata
form into an existing atomic save command.

### Operation Outcome Summary

These distinctions are intentional; a generic batch policy must not replace them.

| Operation                                                   | Agreed outcome policy                                                                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Save one metadata draft                                     | Atomic across text and assignments; failure preserves the whole draft.                                                                                  |
| Save all drafts on exit                                     | Independent form saves; a failure prevents exit but does not undo forms already saved.                                                                  |
| Import folders in one batch                                 | A folder failure stops remaining folders; report completed and intermediate outcomes accurately. Per-folder commit boundaries require technical design. |
| Import queue after execution failure                        | Continue with the next operation.                                                                                                                       |
| Import queue requiring fresh review                         | Wait for review or removal before later operations can start.                                                                                           |
| Sample catalog removal                                      | Independent per Sample; continue and report failures.                                                                                                   |
| Add to several Collections                                  | Independent per destination; continue and report failures.                                                                                              |
| Add/remove Category or Author assignments from their detail | Independent per target; continue and report failures.                                                                                                   |
| Reinclude excluded files                                    | Independent per file; continue and report failures.                                                                                                     |
| Remove memberships from a Collection                        | No confirmation; independent per Sample, continue and report failures.                                                                                  |
| Reorder a Collection                                        | Save each move; on stale sequence, reject and reload current order.                                                                                     |

Import Retry prepares the entire batch again. Non-import retries target failed
items after revalidation, with renewed confirmation when scope or impact changes.

## Persistence Summary

This table records intended lifetimes, not current schema support. Durable queue,
history, presentation preferences, activity, and last-Sample restoration require
contracts beyond the implemented catalog and internal volume preference.

| State                                                            | Intended lifetime                                                                             |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Catalog entities, organization, Favorites, exclusions            | Persistent library data, under domain lifecycle rules.                                        |
| Preview volume                                                   | Persistent; restored before playback.                                                         |
| Visible Sample fields                                            | Persistent typed presentation preference shared across lists.                                 |
| Last previewed Sample                                            | Persistent stable identity; restore paused from zero after access checks, without a sequence. |
| Collection recency                                               | Persistent latest opening/successful edit, not a full visit log.                              |
| Import history and confirmed pending queue                       | Persistent; no automatic execution on restart or automatic history cleanup.                   |
| Unconfirmed import preparation                                   | Session-only; reopening retains selection/data and revalidates.                               |
| Search/filter/sort/scroll, individual selection, inspector state | Session-only context per destination/history entry and tab.                                   |
| Checked batch                                                    | Within the current view/tab only; cleared on exit, not restored by history.                   |
| Preferred panel widths                                           | Session-only; Reset layout restores design defaults.                                          |
| Playback position, sequence, mute, Loop, automatic advance       | Session-only; not restored at restart.                                                        |
| Non-import operation results                                     | Session-only, with the agreed 50-result rotation and protected active/unreviewed failures.    |

Session-only does not imply silent disposal of dirty form drafts: transitions
and ordinary application exit must follow the Save/Discard/Stay rules.

## Follow-up for the Next PR — Import Classification Suggestions

Review filename/subfolder-based classification in a separate follow-up PR, not
as part of the current UX conventions work. Candidate scope includes local,
deterministic token/phrase matching and explicit aliases (for example,
`__FX-Riser.wav` under `RISERS` suggesting FX and Riser), evidence display,
deduplication, reuse of existing Categories, and user review before assignment.

Decide whether genres share the flat Category vocabulary or require a separate
dimension. Also define reimport behavior, source provenance, and the distinction
between filename hints and audio-derived BPM/key estimates. These are discussion
items for that PR, not finalized classification rules or implemented behavior.

## Validation and Implementation Checklist

The six functional convention blocks and the final interaction edge cases are
agreed. The remaining checklist covers prototype validation, implementation
contracts, and separately scoped features. Revisit functional decisions when
validation reveals a concrete problem, recording the change explicitly.

### Visual and Accessibility Validation

- Prototype panel width limits/defaults, fixed breakpoint, overlay geometry,
  sticky headers, Reset layout placement, and native window-header integration.
  Validate the 1024 × 680 target and sidebar height on macOS and Windows.
- Validate responsive row priorities with all selected fields and real long or
  duplicate names, and design visible temporary hiding and disambiguation.
- Design Home supporting-block layout and choose bounded recent-item counts.
- Prototype proportional/fine seek steps and gestures, including short one-shots.
- Design field-conflict comparisons and pending/failed preference-write feedback.
- Validate modal/inspector focus boundaries, nested creation, F6, screen-reader
  announcements, and the initial 5-second notice duration.

### Technical Contracts and Delivery Dependencies

- Adopt/finalize the router and define exact routes/query contracts, including
  Excluded files, import history, operation results, and history-entry contexts.
- Define atomic metadata-save commands and conflict/stale-state checks while
  keeping independently confirmed images and origin corrections separate.
- Define bounded snapshots for Select all and playback sequence order, stable
  append-order queries, and unavailable-entry handling.
- Separate import discovery/review from selected-file catalog writes. Define
  commit boundaries, staged partial outcomes, durable queue/history, interruption
  reconciliation, and multi-root existing-Pack association support.
- Define typed presentation/last-Sample persistence and authorization on restore;
  preserve the existing distinction between observed data and user edits.
- Validate approximate-search thresholds, deterministic tie-breakers, query
  timing, and observed-duration numeric/query contracts against real examples.
- Define history cleanup/storage contracts and compact or paginated result
  details, reviewed-result tracking, and interruption-verification completion;
  protected failures must not require retaining unbounded file payloads.
- Implement explicit inspector-target restoration per history context, keeping
  page-entity editing distinct from member selection and preserving focus rules.

### Separately Scoped Follow-ups

- Next PR: filename/subfolder classification suggestions and genre vocabulary,
  as recorded above.
- Musical metadata: analyzer, tonic/mode vocabulary, validation, provenance,
  confidence, unknown/not-applicable states, and user confirmation/edit semantics.
  Row placement is agreed; analysis contracts and delivery are not.

Record subsequent decisions in their owning sections and keep this checklist
aligned. Update implementation status only when capabilities are delivered.
