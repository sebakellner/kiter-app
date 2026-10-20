# UX Design

Read this guide when designing or changing the application shell, information
architecture, views, navigation, selection, playback interactions, or workflows.
It owns shared shell, navigation, selection, focus, and presentation decisions.
Feature workflows live in the focused guides linked below.

See [UI Patterns](ui-patterns.md) for reusable interaction conventions,
[Domain Model](domain-model.md) for entity semantics, and
[Architecture](architecture.md) for technical boundaries. Visual tokens,
typography, spacing, and component appearance belong to the
[UI foundations](../../src/renderer/src/components/ui/README.md).

## Status and Reading Guide

The first functional UX baseline is agreed. The sections marked Agreed describe
the intended experience, not shipped capabilities or existing IPC contracts.
The current renderer has a first shell prototype with Home and paginated,
library-wide Samples and Favorites under a persistent player. Collections has
creation, bounded browsing, stable-ID detail, individual memberships, manual order,
text editing and reviewed deletion under
[Catalog Organization](features/catalog-organization.md#implemented-collection-creation-and-browsing).
Other sidebar destinations have navigable placeholder views; their workflows remain planned.
Samples and Favorites have a read-only inspector opened explicitly with each
Sample row's Info action, which selects that Sample and opens the panel,
following list selection and showing an empty state when no row is selected.
It supports Close/Escape with focus return, a side-by-side wide layout, and a
compact workspace overlay that blocks underlying regions while preserving player
access. The prototype uses a provisional 1000px viewport breakpoint and a 320px
panel; visual sizing and resizing remain pending. Samples/Favorites restore their
session context on history navigation and reuse the latest destination context
for new visits, including pagination, the Samples Favorite filter, selection,
inspector visibility, scroll, and focus after revalidating loaded results. The
renderer retains 100 history snapshots; older entries fall back to the latest
destination context. Visual
design now has an initial shared dark control/surface foundation and active
navigation treatment. Row density, inspector geometry, custom transport design,
and cross-platform prototype validation remain pending.

Use shared sections here and load only the feature guides relevant to a task.
Routing is adopted for the first two destinations; musical analysis follows its
agreed feature guide. Agreed feature contracts do not establish shipped capabilities.

- [Shell and destinations](#shell-and-destinations)
- [Selection and playback](#selection-and-playback)
- [Editing and library workflows](#editing-and-library-workflows)
- [Search and presentation](#search-and-presentation)
- [Feedback, results, and focus](#feedback-results-and-focus)
- [Conflicts and operation guarantees](#conflicts-and-operation-guarantees)
- [Persistence summary](#persistence-summary)
- [Routing foundation and extensions](#routing--adopted-foundation-and-proposed-extensions)
- [Feature contracts](#feature-contracts)
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
  Collection, Instrument, or Author and shows an empty state when nothing is selected.
  Profile also uses the inspector through its explicit Edit action.
- In wide windows, the inspector sits beside the content. In compact windows,
  it overlays the content while keeping the player accessible.
- The global player occupies a permanent bottom region, including an empty state
  when no Sample is loaded. Navigation must not unmount it or interrupt playback.
- Keep an operation indicator in the header for active imports and Recent results,
  under [Operation Execution](features/operation-execution.md). It is a shell control, not a
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
  Instruments
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
- Packs, Collections, Instruments, and Authors each have a list and dedicated
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
- Library provides access to Excluded files and persistent Operation history
  covering all shared confirmed-operation types, with type/state filters. The
  global operation indicator remains a shortcut to active progress and recent
  results; no separate Activity destination in the header is agreed.
- Library also exposes backup creation, restoration, and automatic-copy management
  under [Backup and Recovery](features/backup-recovery.md). Visual placement remains
  to be designed.
- Library provides access to independent pending-original cleanup management under
  [File Organization](features/file-organization.md#verified-execution-and-partial-outcomes),
  including after the originating history record is deleted. Exact placement and
  routes remain to be designed.
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

- In Pack, Collection, Instrument, and Author lists, a single click selects an
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
Collections. Samples and Favorites implement individual row selection independently
of the global player, name/Play preview, and row-focused Up/Down, Enter, and Space
shortcuts. Selection uses stable Sample IDs, clears when the selected row leaves
the loaded results, and never automatically chooses a replacement. Keyboard
traversal is limited to the loaded page. Favorite and native dragging do not change
selection. Catalog selection is retained in session navigation context and
revalidated on return; inspector editing and multiple selection remain planned.
The full conventions below
describe the agreed target.

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
- Transport modes, end behavior, and sequence invalidation follow
  [Playback](features/playback.md#sequence-semantics).
- In multiple-selection mode, the inspector shows the independently active
  Sample, indicates the batch selection, and does not become a bulk metadata
  editor. The inspected Sample need not belong to the checked batch; batch
  actions target checked Samples, not the inspector's active Sample.
- Agreed batch actions are Add to Collection, removal from the catalog, and,
  within a Collection, membership removal, plus removal of the current direct
  assignment from Instrument/Author detail under Catalog Organization. Catalog removal
  requires impact review and explicit confirmation. Original audio files remain
  untouched. Explicit group classification decisions are separately agreed in
  [Classification](features/classification.md); they do not turn the inspector
  into a bulk metadata editor or authorize other unagreed actions.

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
  persistent preferences, Collection recency, or operation history.

On history restoration, focus the selected row/card when valid; otherwise use
the nearest useful item or view heading if no results remain. The exact bounded
snapshot implementation for Select all still requires technical design.

### Global Player — Agreed

[Playback](features/playback.md) owns transport/modes, sequence snapshots, errors,
last-Sample restoration, source authorization, and removal interactions. The
shell preserves the player across navigation; list selection remains independent.

## Editing and Library Workflows

### Inspector Editing and Forms — Agreed

[UI Patterns](ui-patterns.md#forms-and-inspector-drafts--agreed-planned) owns
atomic metadata drafts, Save/Discard/Stay, validation, nested creation, and conflict
reconciliation. Shell-specific focus and ordinary exit behavior remain below.

### Import Workflow — Agreed

[Import](features/import.md) owns discovery, selection, origin review, confirmation,
progress interaction, result navigation, and target commit/failure rules.
[Operation Execution](features/operation-execution.md) owns its queue, history,
exit guard, and recovery. Apply the shared focus/draft conventions here without
duplicating those feature contracts.

### Catalog Removal and Reinclusion — Agreed

[Catalog Organization](features/catalog-organization.md#catalog-removal-and-reinclusion)
owns impact review, Excluded files, reinclusion, partial results, and navigation
after deletion; Domain Model owns entity/file preservation invariants.

### Collection Membership and Ordering — Agreed

[Catalog Organization](features/catalog-organization.md#collection-membership-and-ordering)
owns pickers, append/reorder rules, internal versus native drag, and retry scope.

### Pack, Instrument, and Author Views — Agreed

[Catalog Organization](features/catalog-organization.md#pack-instrument-and-author-views)
owns detail/assignment interactions and the independent Change origin workflow.

## Search and Presentation

### Global Search — Agreed Interaction

[Search](features/search.md) owns query matching, aliases versus plain text,
approximation/ranking, result navigation, and catalog-change behavior. Global
search remains in the header; shared shortcuts/focus/history rules remain here.

### Sample Filters — Agreed Scope

[Search](features/search.md#filters-and-local-search) owns available filter groups,
OR/AND combination, direct assignments, local query scope, and duration input.
[Duration Analysis](features/duration-analysis.md) owns measurement and scheduling.
Apply shared selection/draft transitions here when results change.

#### Adopted Prototype Layout — Planned

- Place the filter toolbar inside the Sample list's content region, below its
  title/context header and above the rows. Keep it with the fixed list controls
  while results scroll, rather than placing these filters in the global header
  or inspector. Samples and Favorites use the same arrangement.
- Use compact labeled searchable comboboxes with anchored result popovers for
  Instruments and Genres. Allow multiple selected values, preserving the query
  and input focus while choosing results. Give the combobox an accessible name,
  expanded state, and keyboard navigation; expose selected options in its listbox.
  Sample type uses a compact select-style multi-select with its three fixed
  options (One-Shot, Loop, Unknown), without text search. Preserve multiple
  selection and OR matching under Search's filter contract.
  Deliver Instruments first, then Genres and Sample type.
  Instruments remains the product label for sound classifications; the visual
  reference's Instruments label does not introduce another entity or hierarchy.
- Show removable active-value chips in a row below the dropdowns, together with
  Clear all when filters are active. Chips represent selected filters, not a new
  tag vocabulary or automatically recommended/popular values. Selection applies
  immediately under Search's rules, without metadata-style Save/Cancel.
- Add tonality/Key and BPM controls when their effective-value query workflows
  are delivered. The reference does not authorize placeholder filters or new
  Presets destinations. Pack navigation follows its own planned entity workflow.
- Keep the toolbar within the available list width when the inspector opens.
  Wrap controls and chips as necessary, preserving keyboard access, readable
  labels, and clear removal actions. Exact spacing, colors, and compact geometry
  remain prototype/design decisions.

### Sample Names and Source Context — Adopted

- Use the Sample's effective presentation name as its primary label throughout
  the UI: list rows, inspector, player, menus, dialogs, confirmations, toasts and
  status messages. Transfer objects already expose this value as `name`, using
  the original filename when no presentation override exists. Render that value
  as supplied; do not derive a replacement from `relativePath`, strip extensions,
  or invent a new display-name fallback in each component.
- Paths describe source locations, not Sample identity or primary display text.
  Show relative paths as secondary context when they differ from the name or are
  needed to distinguish displayed homonyms. Keep that context visible without
  requiring hover. If displayed Samples also share the same relative path, show
  their source-folder context; the complete source path may be used when needed
  to resolve that ambiguity. Otherwise full paths belong in Info, tooltips and
  workflows explicitly reviewing filesystem locations.
- Accessible action names use the same Sample name as visible UI. Associate
  secondary path context through accessible descriptions rather than replacing
  the name with a path. Waveform and playback labels follow the same naming rule.
- Continue addressing every operation, selection, membership and drag by stable
  Sample identity. A name, relative path or source folder is not an operation key.
  Naming changes never rename, move or modify source audio, change search scope,
  or require loading the complete library to inspect name collisions.

### List and Card Presentation — Agreed

- Samples, Favorites, and Sample lists within Packs and Collections use rows,
  rather than an alternate card presentation.
- Wide Sample rows accommodate name, Play/Pause, Favorite, contextual menu,
  waveform, observed duration, format, origin Pack, direct Instruments, direct
  Authors, and relative source path. Include selection and distinct drag controls
  where applicable. Limit inline relationship labels with access to the rest.
- BPM and tonality are planned Sample fields under
  [Musical Analysis](features/musical-analysis.md). Show usable automatic estimates
  with provenance and manual precedence, not mandatory acceptance before use.
  Tonality is tonic plus mode; Unknown and Not applicable remain distinct. These
  agreed behaviors do not establish an implemented or validated analyzer.
- Compact Sample rows prioritize name, waveform, and duration. Secondary data
  moves to supporting surfaces or the inspector while essential actions remain
  accessible. Exact responsive layout remains a visual-design decision.
- Packs and Collections use cover cards with a placeholder when no cover exists,
  name, and Sample count. Pack cards additionally show bounded direct Author and
  Instrument labels and source-folder context, rather than a description excerpt.
  Collection cards keep only the essential cover, name, and count, apart from
  secondary information needed to distinguish duplicate names.
  Instruments and Authors use text cards with their names and usage counts,
  without introducing new image fields. Cards preserve the agreed distinction
  between selection and opening.
- Samples and Favorites initially sort alphabetically by display name, with a
  stable tie-breaker. Collections retain their manual sequence.
- Main Pack, Collection, Instrument, and Author lists also initially sort
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

These are planned presentation requirements. Musical-analysis delivery contracts,
typed preference contracts, exact responsive field priorities, and
deterministic duplicate-name disambiguation mechanics still need implementation
design.

### Shell Sizing and Scrolling — Agreed

- Target a minimum useful window size of 1024 × 680 logical pixels. This is a
  design target requiring prototype validation on macOS and Windows, not a
  validated or implemented minimum supported window size.
- Use 1280 × 800 logical pixels as the prototype's initial window size, giving
  catalog browsing more room than the compact-use target. These are outer window
  dimensions, including the native frame; they do not establish an equivalent content viewport or enforce
  a minimum resize size.
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

[UI Patterns](ui-patterns.md#feedback-and-short-operations--agreed-planned) owns
notices, local feedback, partial-result summaries, stale data, and error details.

### Import History and Recent Results — Agreed

[Operation Execution](features/operation-execution.md#history-and-result-access)
owns persistent history, session-result rotation, manual cleanup, deleted records,
and operation-indicator/result access. Settings → Library exposes a common
Operation history for import, classification, relinking, file organization, and
export. Shell
keyboard boundaries remain here.

### Keyboard, Focus, and Overlays — Agreed

- Selecting an element updates selection but does not open a closed inspector.
  Info or Edit explicitly opens it; while open, it follows selection under the
  dirty-draft rules.
  Sample Info belongs to its row, not the global header. It selects and inspects
  that Sample without changing playback; preview, pause, and resume do not retarget
  the inspector. In wide mode, Info focuses the selected row so Up/Down can
  continue browsing; inspector updates never take focus from the list. In compact
  mode, opening moves focus into the overlay. Closing returns focus to the current
  selected row, falling back to the opener or content when selection is gone.
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
  The prototype implements this region cycle, using the selected Sample row as
  the content destination when present. Compact inspector mode restricts it to
  inspector/player; modal dialogs suspend the shell shortcut.
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

## Routing — Adopted Foundation and Proposed Extensions

A React Router SPA with nested routes under a persistent shell is adopted using
`createHashRouter`. Home and Samples are implemented prototype destinations;
Favorites is connected to the persistent catalog. Collections implements creation,
paginated browsing and `/collections/:id` details; Packs, Instruments and Authors
have placeholder views.
[Architecture](architecture.md#renderer-navigation-and-shell) owns configuration
and current state boundaries. The remaining route map and complete navigation
context restoration below are proposals for later deliveries.

The proposed route map corresponding to the agreed destinations is:

```text
/home
/samples
/favorites
/packs
/packs/:packId
/collections
/collections/:collectionId
/instruments
/instruments/:instrumentId
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

Use [UI Patterns](ui-patterns.md#forms-and-inspector-drafts--agreed-planned) for
field-conflict reconciliation, [Catalog Organization](features/catalog-organization.md)
for stale impact/reorder/origin review, and [Playback](features/playback.md#removal-interactions)
for loaded/playing Sample and missing-sequence-context behavior. These remain
planned contracts, not evidence of existing atomic form saves or batch IPC.

### Operation Outcome Summary

Outcome policies intentionally differ. Follow their owning contracts rather
than imposing a generic batch transaction/retry policy:

- [Forms](ui-patterns.md#forms-and-inspector-drafts--agreed-planned) and
  [exit review](#keyboard-focus-and-overlays--agreed).
- [Import commits/failures](features/import.md#commit-boundaries).
- [Standalone classification](features/classification.md#confirmed-execution).
- [Catalog assignments/memberships/removal](features/catalog-organization.md).
- [Shared queue/recovery](features/operation-execution.md).

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
| Search/filter/sort/scroll, individual selection, inspector state | Session-only context per destination/history entry and tab.                                   |
| Checked batch                                                    | Within the current view/tab only; cleared on exit, not restored by history.                   |
| Preferred panel widths                                           | Session-only; Reset layout restores design defaults.                                          |
| Playback position, sequence, mute, Loop, automatic advance       | Session-only; not restored at restart.                                                        |

Session-only does not imply silent disposal of dirty form drafts: transitions
and ordinary application exit must follow the Save/Discard/Stay rules.
Feature-specific lifetimes (confirmed queue/history, unconfirmed preparations,
rejections, and analysis pause) are owned by the corresponding feature guides.

## Feature Contracts

[Classification](features/classification.md) owns the agreed Genre seed,
Instrument recognition terms, aliases, Sample-type suggestions, evidence, review,
and rejection memory. [Import](features/import.md) owns integration with import;
[Operation Execution](features/operation-execution.md) owns queue/history/recovery.
Feature-specific technical contracts and delivery order live with those guides,
not as a second workflow specification here. Visual design remains deferred.

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

The classification, import execution/queue/recovery, Sample-type, search, and
duration business-decision round is complete for the scope recorded above.
Remaining executable contracts are defined per delivery; this does not mark
features beyond those guides as agreed or any feature as implemented.
Visual design and prototype validation remain deferred.

- Adopt/finalize the router and define exact routes/query contracts, including
  Excluded files, common operation history, operation results, and history-entry
  contexts.
- Define atomic metadata-save commands and conflict/stale-state checks while
  keeping independently confirmed images and origin corrections separate.
- Define bounded snapshots for Select all and playback sequence order, stable
  append-order queries, and unavailable-entry handling using the Playback and
  Catalog Organization contracts.
- Define typed presentation/last-Sample persistence and authorization on restore;
  preserve the existing distinction between observed data and user edits.
- Feature-specific delivery contracts and validation are tracked in each feature
  guide, including import/queue, classification, search, and duration. Do not
  maintain duplicate executable-contract lists here.
- Implement explicit inspector-target restoration per history context, keeping
  page-entity editing distinct from member selection and preserving focus rules.

### Separately Scoped Follow-ups

- Deliver the agreed feature contracts through their owning guides' incremental
  plans, preserving current preview, Favorites, and authorized native dragging.
- Musical metadata business rules are agreed in
  [Musical Analysis](features/musical-analysis.md); analyzer selection, validated
  confidence/ambiguity criteria, technical contracts, and visual delivery remain.

Record subsequent decisions in their owning sections and keep this checklist
aligned. Update implementation status only when capabilities are delivered.
