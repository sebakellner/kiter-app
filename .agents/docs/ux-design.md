# UX Design

Read this guide when designing or changing the application shell, information
architecture, views, navigation, selection, playback interactions, or workflows.
It owns experience-level decisions and open design questions.

See [UI Patterns](ui-patterns.md) for reusable interaction conventions,
[Domain Model](domain-model.md) for entity semantics, and
[Architecture](architecture.md) for technical boundaries. Visual tokens,
typography, spacing, and component appearance belong to the design system;
its documentation location is still to be defined.

## Shell and Navigation Design

The decisions below were agreed during UI planning. They describe the intended
experience, not implemented capabilities. The design system is being designed;
visual specifications and feature implementation follow separately. The current
renderer still renders the folder-based Library directly, without a router.

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
  before the first preview. Navigation must not unmount it or interrupt playback.
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
- Accommodate long Collection lists without making primary destinations
  inaccessible; the exact sidebar scrolling behavior remains a design detail.
- Packs, Collections, Categories, and Authors each have a list and dedicated
  entity detail views for exploring their contents.
- Profile and Settings are separate destinations reached from the header menu.
  Profile concerns the local identity; Settings concerns application preferences.

### Home — Agreed Content

Home includes:

- Recent imports.
- Recent Collections.
- A library summary with counts and navigation to catalog sections.
- Quick actions for importing audio and creating a Collection.

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
  no additional persistent preferences are implied.
- Library provides access to Excluded files and persistent import history. The
  global operation indicator remains a shortcut to active progress and recent
  results; no separate Activity destination in the header is agreed.
- Settings volume and player volume share one live preference. Apply volume
  immediately and persist on completing the adjustment, without Save/Cancel.
  If persistence fails, keep the audible level and report that it was not saved.
  This is an explicit exception to metadata-form draft behavior.
- Initially, do not clean up import history automatically. Manual cleanup and
  measurement of file-detail storage growth remain to be designed. History
  retention does not remove catalog entities or source audio.
- These views and the required recency/history persistence are planned. History
  presentation, cleanup controls, and pending/failed preference-write feedback
  details remain open.

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
  playback has ended, it starts again from the beginning.
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

Focus fallback when a restored selection no longer exists and the exact bounded
snapshot implementation for Select all remain to be specified.

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
- When advancing encounters an unplayable Sample, report the failure visibly and
  try the next entry. Bound skipping so an entirely unplayable sequence cannot
  cause an endless loop, including with sequence Loop enabled.
- Before the first preview, show a discreet Choose a sample to preview empty
  state and disabled transport controls within the permanent player region.

These are intended controls and interactions, not delivered player capabilities.
Sequence snapshot mechanics, transport behavior when paused, context-unavailable
recovery, seek increments, and playback-mode session defaults remain to be
specified. The currently approved persistent playback preference is volume only.

### Inspector Editing and Forms — Agreed

- Inspector fields edit a draft of catalog presentation data, not source files.
  Show explicit Save and Cancel controls when there are changes. Saving is not
  triggered by field blur.
- Category assignments and Author credits belong to the same draft as textual
  fields. Save confirms them together; Cancel discards their pending changes.
  Sample and Pack assignments remain independent. This agreement does not imply
  that a combined save command already exists; define its transaction and failure
  semantics before implementing the form.
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
  creation completes. Pack import is a separate workflow still to be designed.
- Creation dialogs support Escape to request dismissal; if dirty, ask before
  discarding. Clicking outside does not dismiss them. Restore focus on close.
- Cmd/Ctrl+Enter submits the focused form. Enter alone does not submit from text
  inputs and retains its control-specific behavior, including newlines in
  multiline fields and confirming selector choices.
- During a save, show Saving, prevent duplicate submission, and disable editing
  and transitions away from that form until the result is known. Playback remains
  available. On failure, restore editing with the draft intact.
- Category and Author assignment selectors allow creating a missing entity in a
  short dialog. On success, return to the selector and add the entity to the
  parent's draft instead of navigating to its detail. The entity itself has been
  created; discarding the parent's assignment draft does not undo that creation.
  Make this distinction clear in the flow.

These are intended editing conventions, not delivered forms or IPC operations.
Application-close rules are specified in Keyboard, Focus, and Overlays below.
Focus restoration after nested creation dialogs and combined-save failure
semantics remain to be specified.

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
- Prevent application exit while an import executes and explain that execution
  must finish first. Do not automatically quit afterward; the user may close
  Kiter again. Minimizing or hiding the window remains available. Define handling
  of queued preparations separately; do not imply recovery from forced process
  termination or an OS shutdown.
- Keep a local persistent operation history so completed and failed import
  results remain available after restart. This requires new persistence and
  result queries; it is distinct from the session-only unconfirmed preparation.
  Do not clean history automatically initially, as specified in Profile and
  Settings. Interruption reporting and pending-queue recovery remain open.
- Show stages and a visible file-level progress/result list. Use percentages only
  when the total is known, and distinguish discovery from catalog completion and
  Pack registration. Report intermediate committed outcomes accurately if a
  later stage fails; per-folder atomicity is not yet defined.

The exact confirmation/commit boundary, manual history cleanup, interruption reporting,
pending-queue recovery and application-close handling, and operation-specific
result scope remain to be agreed. Overlap review also needs precise treatment
for multiple roots already associated with the same Pack. This workflow is
planned; the existing folder import and internal Pack operations do not deliver
it yet.

### Catalog Removal and Reinclusion — Agreed

- Within a Collection, put Remove from Collection and Remove from Library in
  the action menu as clearly distinct operations. The first removes memberships
  only, preserving Samples, Favorites, other organization, and original audio.
- Apply membership removal without a confirmation dialog or promised Undo.
  Reflect success only after the operation completes. This includes individual
  and batch membership removal, adding the latter to the initially agreed batch
  actions alongside catalog removal.
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
Excluded files destination are not implied to exist. Exact Sample-removal batch
transaction semantics, removal of a paused but loaded Sample, playback-context
changes after Pack/Collection deletion, and reinclusion retry details remain
to be specified.

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
  source result's order, including checked Samples hidden by filters using the
  same ordering criterion. Define deterministic handling for ordering changes
  and missing values before implementation.
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
  share names; design secondary identifying information without requiring unique
  names. The precise duplicate-name presentation remains open.
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

These are intended interactions. Concurrent reorder handling, precise source-order
resolution for hidden selections, and retry behavior when source or destination
data change remain to be specified.

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

These are planned views and interactions. Origin-review details and reconciliation
with an open inspector after independent assignment changes remain to be agreed.
Batch origin correction is outside the initial agreed scope.

### Global Search — Agreed Interaction

- Show suggestions while the user types in the global header search.
- Search Samples, Packs, Collections, Categories, and Authors.
- Search entity names and Sample filenames/relative source paths, notes and
  descriptions, and related metadata. Samples match the names of their directly
  assigned Categories and Authors and their origin Pack's name, but not that
  Pack's Categories or Authors. Exact relationship traversal for other entity
  types remains open. Do not infer musical properties from audio.
- Match text case- and accent-insensitively, support substrings, and require all
  query words to match, potentially across different searchable fields. Also
  tolerate approximate spelling errors; approximation limits and its ranking
  relative to exact matches still need definition.
- Group a bounded set of suggestions by entity type, with access to all results.
- Allow opening a matching entity directly or opening a full results view.
- Present full results as a mixed list ordered by relevance, with entity-type
  filters and clear type identification.
- Activating a Sample suggestion navigates to Samples, locates and selects that
  Sample, and allows inspection without automatically starting playback. Clear
  the destination's local search and filters so the Sample is not hidden; Back
  preserves the prior navigation context.
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
- Duration filtering requires catalog-queryable observed data; the current
  browse-time waveform/player duration does not establish that capability.
  Unknown durations must remain distinguishable from measured values.
- A duration range initially excludes unknown durations. Provide an explicit
  option to include unknown durations alongside matching measured values.
- Availability was not selected as an initial filter. Missing-source states must
  still be presented accurately when applicable.

Search and filters are planned. Approximate-match limits and ranking, relationship
traversal for non-Sample results, duration bounds, local search scope, and the
precise history behavior when locating a Sample remain to be agreed. These
decisions do not imply that library-wide search or its required queries are
implemented.

### Feedback and Short Operations — Agreed

- Prefer local success feedback for everyday actions: update Favorite in its
  control and show Saved in the editing context. Use a toast when the outcome is
  otherwise easy to miss, such as removing a membership. Do not announce success
  before the operation completes.
- Present recoverable errors near their action when possible. If that context
  disappears, use a persistent global notice with access to relevant details.
  Field errors remain attached to their fields and recoverable drafts survive.
- Informational and success notices without required actions dismiss after a
  short interval, paused while hovered or focused. Errors and notices requiring
  action do not dismiss automatically. Exact durations remain a design detail.
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

These conventions are planned. Exact notice durations, limits and eviction for
session results, focus entry to Recent results, and action eligibility while
displaying stale query data remain to be specified.

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

These are planned behaviors. Exact nested menu/search Escape priority, focus
restoration across dialog transitions, and multiple dirty-draft handling on exit
remain to be specified.

### Routing — Proposed Technical Direction

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

### Remaining Design Decisions

- Shell dimensions, minimum window size, compact-mode breakpoint, panel resizing,
  and detailed window-header behavior on each target platform.
- Player sequence snapshot mechanics, paused transport behavior, unavailable
  context recovery, seek increments, and playback-mode session defaults.
- Sidebar scrolling and handling duplicate Collection names.
- Home supporting-block layout and recent-item limits.
- Import-history presentation, manual cleanup, storage-growth measurement, and
  pending/failed preference-write feedback details.
- Bounded Select all snapshot implementation and focus fallback when restored
  selections are no longer valid.
- Sample-removal batch transaction/failure semantics, removal of paused loaded
  Samples, and playback-context changes after Pack/Collection deletion.
- Excluded files route and reinclusion retry details.
- Concurrent Collection reorder handling, precise append-order resolution for
  hidden selections, and membership retries after source/destination changes.
- Detail-view inspector targeting edge cases.
- Reconciliation of independent assignment changes with open inspectors and
  individual origin-review details.
- Multiple dirty-draft handling on application exit and focus restoration after
  creation dialogs opened from assignment selectors.
- Combined metadata-save transaction/failure semantics.
- Import confirmation/commit boundaries, interruption reporting,
  pending-queue recovery and close handling, operation-specific result scope,
  and overlapping roots associated with an existing Pack.
- Approximate search limits and ranking, relationship traversal for non-Sample
  results, duration bounds, local search scope, and precise history behavior
  when locating a Sample.
- Nested Escape priority and focus restoration across dialog transitions.
- Notice durations, bounded session-result retention, keyboard access to Recent
  results, and action eligibility while query data is stale.
- Final router adoption, exact route/query contracts, and session-context storage.

Record further agreed decisions here as planning continues, keeping proposals
and implementation status explicit.
