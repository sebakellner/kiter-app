# Beta Scope and Delivery

Read when planning the first distributed beta, choosing delivery slices, or
assessing beta readiness. This document owns the agreed release scope and
acceptance gates, not feature business rules or implementation status.
[README](../../README.md) owns current user-facing capabilities; the feature
guides below own detailed behavior. All included workflows must be delivered
before calling this beta ready; intermediate slices are development milestones.

## Agreed Target

Deliver a local-first sample-library beta on **both macOS and Windows**, with
equivalent core workflows. Automatic BPM and tonality detection are required,
not optional follow-ups. The chosen scope includes all functional blocks below;
it is a broad beta delivered incrementally, not a commitment to one implementation
PR or a release date.

The core journey is import → find → preview → organize → use in a DAW, with
musical analysis, reviewed file organization/export, and recoverable library data.
Minimum OS versions, CPU architectures, actual DAW compatibility, and distribution
mechanics remain release decisions requiring validation under
[Release Process](release-process.md); targeting both platforms does not establish
support for untested versions or architectures.

## Included Scope and Observable Acceptance

Each row includes its owning guide's agreed failure, stale-state, retry, and
recovery behavior, not only a successful demonstration. Persistence must survive
restart where specified; internal storage or IPC alone does not complete a row.

| Required block                   | Acceptance for the beta                                                                                                                                                                                                                         | Owning contracts                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Shell, navigation, and editing   | Home, library/entity destinations, search, inspector, Profile/Settings, and permanent player form connected journeys. Selection, drafts, focus, history, and responsive layouts behave as agreed.                                               | [UX Design](ux-design.md), [UI Patterns](ui-patterns.md)                                                   |
| Persistent library and Favorites | Multiple source folders share stable Sample identities at overlapping locations. Favorites and organization survive restart; missing audio does not delete them.                                                                                | [Domain Model](domain-model.md), [Data Access](data-access.md)                                             |
| Reviewed import and Packs        | Select files before catalog writes; import standalone or as Packs, reimport without duplicates, review origin conflicts, and inspect actual partial results.                                                                                    | [Import](features/import.md)                                                                               |
| Collections                      | Create/edit/delete Collections, add/remove references, and persist manual membership order without copying audio.                                                                                                                               | [Catalog Organization](features/catalog-organization.md)                                                   |
| Classification and credits       | Manage Categories, Genres, Authors, direct assignments, Sample type, and manual origin corrections with agreed impact reviews. Sample/Pack assignments remain independent.                                                                      | [Domain Model](domain-model.md), [Catalog Organization](features/catalog-organization.md)                  |
| Classification suggestions       | Recognize path-based Category/Genre/type evidence, manage aliases, stage acceptances/rejections, and execute standalone or within import without overwriting confirmed organization.                                                            | [Classification](features/classification.md)                                                               |
| Global search                    | Search all included entities with agreed matching, approximation, ranking, pagination, local scope, and filters, including duration and effective musical values.                                                                               | [Search](features/search.md)                                                                               |
| Playback and DAW use             | Global transport, waveform access, sequence behavior, volume persistence, and last-Sample restoration work as agreed. Original-file native dragging is verified with actual receiving DAWs on both platforms.                                   | [Playback](features/playback.md), [Architecture](architecture.md#native-and-platform-integration)          |
| Duration analysis                | Persist source-bound duration with background measurement, pause/resume, invalidation, controlled retry, and unknown/error states independent of preview.                                                                                       | [Duration Analysis](features/duration-analysis.md)                                                         |
| BPM and tonality                 | Analyze automatically in background, expose usable estimates with provenance, support manual overrides and modes, and never replace edits on reanalysis. Validate the chosen analyzer's accuracy and actual mode/codec coverage before release. | [Musical Analysis](features/musical-analysis.md)                                                           |
| Source management and recovery   | Relink individual Samples and folders, recover partial folders, replace sources explicitly, and unregister/reactivate roots with reviewed access consequences and preserved organization.                                                       | [Catalog Organization](features/catalog-organization.md#source-relinking--agreed-baseline-not-implemented) |
| Physical file organization       | Rename individually/by template, move, and centralize under reviewed family/instrument layouts, preserving identity and verifying copies before original deletion. Pending originals remain manageable independently of history.                | [File Organization](features/file-organization.md)                                                         |
| Export                           | Export Samples, Packs, and Collections as unchanged audio copies with reviewed layouts and optional versioned Kiter JSON manifests; partial output and retries are accurately represented.                                                      | [Export](features/export.md)                                                                               |
| Profile and presentation         | Edit the local profile/Author link, manage avatar and Pack/Collection covers, and persist the agreed presentation preferences. Personalization is limited to the approved fields and behaviors.                                                 | [Domain Model](domain-model.md), [UX Design](ux-design.md#profile-and-settings--agreed)                    |
| Confirmed operations             | Shared serial queue, progress/results, cancellation/exit policies, durable history, and verifiable restart/manual continuation work for every included confirmed-operation type.                                                                | [Operation Execution](features/operation-execution.md)                                                     |
| Backups and restoration          | Create manual and mandatory protective backups, restore compatible catalog/images, preserve damaged current state when necessary, and revalidate restored sources/operations.                                                                   | [Backup and Recovery](features/backup-recovery.md)                                                         |

## Delivery Order and Dependencies

### Prototype Progress

- **Delivered — single-Sample classification suggestions:** opening Sample Info
  loads Category, Genre, and Sample-type suggestions from cataloged paths and
  available Pack Genre evidence. Apply one or Apply all persists the selected
  suggestions, creating required vocabulary where needed. Evidence is available
  for inspection; ignoring a suggestion writes nothing. See
  [Direct Single-Sample Suggestions](features/classification.md#direct-single-sample-suggestions--adopted-simplified-workflow)
  for the implemented scope and limits.
- **Still planned — batch and import classification:** reviewed multi-Sample/Pack
  decisions, rejection memory, and confirmed execution/recovery remain part of
  the delivery plan. The single-Sample prototype completes an initial slice of
  classification suggestions, not the full beta acceptance row.

### Planned Delivery Sequence

Deliver focused end-to-end slices in subsequent implementation PRs. This sequence
organizes dependencies; it does not authorize releasing an intermediate slice as
the complete agreed beta. Define each slice's exact executable contracts before
implementation, preserving working preview, Favorites, and native dragging.

1. **Protection and application foundation:** backup/migration protection and
   restoration, connected shell/navigation/drafts, bounded catalog access, and
   narrow typed IPC. Deliver source authorization and managed-image foundations
   needed by later workflows rather than UI placeholders alone.
2. **Library organization:** connect Samples/Favorites, Packs, Collections,
   Category/Genre/Author operations, profile/images, and persistent preferences.
   Deliver shared query/selection/sequence contracts where their journeys need them.
3. **Reviewed execution and discovery:** deliver shared confirmed-operation
   persistence/reconciliation, reviewed import/reimport, and classification
   vocabulary/aliases/review. Each execution path includes its recovery guarantees.
4. **Discovery and musical use:** complete library-wide search, duration and
   musical background analysis, musical editing/filters, global playback modes,
   and native DAW integration. Evaluate analyzer feasibility early so it cannot
   remain an unvalidated dependency at the end of delivery.
5. **Source and filesystem workflows:** complete individual/folder relinking and
   registration lifecycle, then verified physical organization, pending-original
   management, export, and manifests using the shared execution infrastructure.
6. **Packaged beta qualification:** integrate and qualify the complete scope on
   macOS and Windows, resolving cross-feature recovery and accessibility failures
   before distribution.

Independent work may overlap after its dependencies are explicit; feature rules
and recovery guarantees remain mandatory regardless of implementation order.

## Beta Exit Gates

- Every included row has a connected, persistent where required, verified user
  journey. Track delivery evidence with implementation work; this scope document
  does not mark features complete merely because their contracts exist.
- Validate the packaged app on both platforms, including installation/launch,
  offline use, file permissions, playback, and original-file drops in actual DAWs.
  Record tested OS versions, architectures, DAW versions, and audio-format gaps.
- Demonstrate reviewed conflicts and partial outcomes, restart reconciliation,
  protected originals, backup/restoration, and data-preserving supported upgrades.
  No unresolved issue may silently lose organization, overwrite/delete originals,
  authorize arbitrary paths, or misreport partial work as success.
- Select and validate the local musical analyzer on representative audio; document
  supported detection modes/codecs, acceptance/ambiguity criteria, and known gaps.
  Manual mode vocabulary alone does not establish automatic detection coverage.
- Validate large-library behavior against representative data and agree measurable
  budgets as delivery contracts. Check responsiveness and bounded work during
  search, analysis, import, and playback; do not claim an unmeasured capacity.
- Validate agreed keyboard/focus/draft interactions and compact/wide layouts on
  both platforms. Complete applicable automated and manual checks under
  [Testing Conventions](testing-conventions.md) and [Release Process](release-process.md).
- Resolve minimum OS/CPU support, artifact identity, signing/notarization,
  distribution, update/recovery approach, and the beta feedback/reporting channel
  before publication. Publish known limitations and tested-platform evidence.

## Outside This Beta's Approved Scope

Accounts, cloud sync, multiple Libraries/profiles, Kits, Tags, named favorite
lists, audio synthesis/editing/transcoding, reusable layout presets, advanced
search syntax, harmonic-compatibility inference, and third-party manifest
interchange are not approved by this scope. Additional behavior requires an
explicit product decision; minor UI polish does not expand entity/workflow scope.

Changing the required rows or platform target requires an explicit scope revision.
Open delivery contracts and release decisions do not silently remove required
features or turn planned capabilities into delivered ones.
