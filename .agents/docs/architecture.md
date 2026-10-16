# Architecture

Read this guide when changing process boundaries, domain responsibilities,
persistence, filesystem workflows, background processing, or native integrations.
See [AGENTS.md](../../AGENTS.md) for product scope and platform targets, and
[Common Guidelines](common-guidelines.md) for coding conventions.
Use [Domain Model](domain-model.md) for entity responsibilities, relationships,
and lifecycle invariants; this guide owns their technical implementation boundaries.

## Status and Principles

This document describes the current foundation and the intended evolution.
Sections labeled **planned** are design guidance, not implemented capabilities
or permission to introduce dependencies without an implementation requirement.

The catalog starts from a clean Drizzle/`better-sqlite3` database with committed
SQL migrations. Earlier development databases are untouched and not imported.
The typed schema, DB worker, migrations, and IPC foundation are implemented;
complete entity workflows are delivered separately.

- **Local-first:** core library workflows run on the producer's computer
  without a backend, account, or network connection.
- **Simple modular application:** one Electron app, with explicit domain
  services; no microservices, plugin framework, or generic entity engine.
- **Clear ownership:** main owns privileged operations and persistent data;
  renderer owns presentation; preload exposes a narrow bridge.
- **File integrity first:** organization must preserve audio and references.
  Potentially destructive operations require review and explicit confirmation.
- **Incremental scaling:** use batching, indexing, bounded work queues, and
  virtualization when justified, rather than adding infrastructure speculatively.
- **Cross-platform:** maintain equivalent core behavior on macOS and Windows.
- **English-first:** the initial release's UI and documentation are in English.

## Current Foundation

| Layer                                                                                              | Current responsibility                                                                                                                           |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Main entry point](../../src/main/index.ts)                                                        | Application lifecycle, protocol registration, IPC registration, and window creation.                                                             |
| [Main IPC](../../src/main/ipc/library.ts)                                                          | Authorized folder import, favorite writes, and native drag requests.                                                                             |
| [DB client](../../src/main/db/index.ts)                                                            | Asynchronous commands, worker readiness/correlation, failure handling, draining shutdown.                                                        |
| [Connection](../../src/main/db/runtime/connection.ts)                                              | Worker-only native connection and Drizzle handle, format/history checks, atomic migrations/bootstrap and integrity checks.                       |
| [Schema](../../src/main/db/schema/index.ts)                                                        | Typed 17-table schema, indexes, checks and foreign keys; committed SQL in [drizzle](../../drizzle).                                              |
| [Operations](../../src/main/db/operations)                                                         | Typed source import, Favorite, profile/Preferences, internal classification and ordered Collection operations, including impact-checked removal. |
| [Library service](../../src/main/services/library/index.ts)                                        | Recursive audio discovery, canonical folder preparation, and catalog import coordination.                                                        |
| [Audio service](../../src/main/services/audio/index.ts)                                            | In-memory authorization of the loaded library and local audio streaming.                                                                         |
| [Preload](../../src/preload/index.ts)                                                              | Typed methods exposed through `contextBridge`.                                                                                                   |
| [Shared contracts](../../src/shared/ipc/index.ts)                                                  | Domain-specific channels, named request DTOs, API, validated result envelopes and transfer types.                                                |
| [Library UI](../../src/renderer/src/features/library/components/FileList/index.ts)                 | Sample rows, current-folder favorite filter, shared preview, and native dragging.                                                                |
| [Waveform processing](../../src/renderer/src/features/library/components/Waveform/waveformData.ts) | Serialized, cancellable decoding and bounded peak caching.                                                                                       |

The folder view remains session-scoped, while sample UUIDs and favorites persist
in SQLite under `userData`. Sample URLs are temporary capabilities, not durable
sample identities. Entity types/schema exist, but there is no task journal, Pack/Collection editor, global search index,
automatic restore of the selected folder, or relocation/relinking workflow.
See [Data Access](data-access.md#implemented-catalog-and-favorites) for storage,
driver, schema, failure behavior, and backup limitations.

### Service Modules

- Group each service by responsibility under `src/main/services/<service>/`.
  Keep its implementation, private helpers, and internal types together.
- Each module has a small `index.ts` with explicit public exports. Application
  consumers import the service folder; internal files use direct relative
  imports rather than their own barrel. Do not add a global services barrel.
- Persistence infrastructure lives in `src/main/db`, not a catch-all domain service.
  Its public API exports only `DbClient`. Connection, schema, migrations,
  operations, and private worker protocol remain internal. Importing that API
  must not load SQLite or Drizzle schema in main, or start a worker.
- Follow [DB Module Organization](data-access.md#db-module-organization) for
  persistence folders, dispatchers, operation ownership, and shared utilities.
- The DB worker is a separate bundler entry. Its compiled runtime path and copied
  migration assets must work independently of the current working directory.
- `DbClient.open` resolves after migrations, bootstrap, and integrity checks.
  Consumers reuse the client. Closing rejects new work, drains prior writes and
  awaits exit. Native-addon imports stay out of main's bundle.
- Drizzle types describe persistence rows, not domain/IPC contracts. Main services
  coordinate filesystem and domain workflows; worker operations handle DB
  transactions. Do not add generic repositories or one service per table.
- Shared domain modules own serializable entity contracts and pure validation,
  not database row types or privileged filesystem helpers. Add operation modules
  when their workflows are implemented, not one module per table.
- Isolated unit tests may import implementations directly, keeping pure
  helpers independent of Electron and using explicit `.ts` paths for Node's
  type-stripping runner. Integration tests exercise the public service APIs.

## Process Boundaries

```text
Renderer: feature UI and presentation state
    |
    | explicit typed methods and removable event subscriptions
    v
Preload: contextBridge
    |
    | IPC commands and progress/error events
    v
Main: validation -> application services -> filesystem / catalog / native APIs
    |
    +-- DB client -> worker -> Drizzle / better-sqlite3 / SQLite
    +-- bounded background analysis when required

Authorized audio protocol -> streamed bytes -> preview / waveform consumer
```

- Renderer must not import main-process implementations or receive generic
  filesystem or IPC access. Shared contracts contain serializable data, not
  Electron objects, database handles, or decoded audio buffers.
- Keep IPC handlers thin: validate the caller and input, invoke an operation,
  and translate its outcome. Domain and filesystem behavior belongs in services.
- Shared IPC modules use `domain:kebab-case` channels, named request objects and
  `IpcResult<T>` responses. Preload validates envelopes/data; UI unwraps results
  at its error boundary. Do not rely on Electron serializing custom Error fields.
  Keep the DB worker protocol private and separate. Native drag remains an
  immediate send/event workflow, not an asynchronous invocation.
- Validate sender/frame authorization as well as sample access before privileged
  work. A typed interface is not runtime validation.
- Requests return explicit results; long-running operations use task identifiers
  and progress events. Every subscription must have a cleanup function.
- Do not send large audio buffers or an entire evolving catalog over IPC for
  each UI update. Stream audio and query bounded result sets.
- Keep application startup and window creation as composition points. Register
  handlers once; do not scatter global lifecycle setup across feature modules.

## Domain Responsibilities (Planned)

These are ownership boundaries, not a requirement to create all modules now.
Introduce them under existing folders as the corresponding features arrive.

| Responsibility         | Owns                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Library/catalog        | Imported roots, stable sample identities, file locations, availability, and rescanning.                                |
| Packs                  | Imported package metadata, declared credits, cover references, and origin assignments.                                 |
| Collections            | User-created selections and ordered unique Sample memberships.                                                         |
| Classification         | Shared Categories and reusable Authors, with independent Sample/Pack credits, without inheritance or credit roles.     |
| Local profile/settings | Singleton UserProfile, optional Author link and avatar, and typed Preferences; no login or per-user catalog ownership. |
| Favorites              | Sample marks independent of Pack and Collection membership.                                                            |
| Managed assets         | Shared validated image copies for covers/avatars, reference safety, and recoverable cleanup.                           |
| Analysis               | Technical metadata, waveform peaks, processing status, and derived-data invalidation.                                  |
| Search                 | Global catalog queries and filters across samples and related metadata.                                                |
| File operations        | Rename, relocate, centralize, and export plans and their execution.                                                    |
| Tasks                  | Bounded scheduling, progress, cancellation, and recoverable operation records.                                         |

Services may call each other through explicit operations; avoid circular
dependencies. Components must not independently implement catalog mutations
or filesystem conflict resolution.

Packs and Collections reference Sample IDs, not copies of files. Importing a
folder and registering a Pack are distinct concepts: neither implies relocation.
Centralization is a separate, user-approved file operation.

The first entity delivery includes all agreed organization entities, the local
profile and Preferences, independent Sample/Pack credits, and covers/avatars.
Persistent technical analysis follows separately. Commands spanning multiple
entities execute inside one worker-owned transaction; filesystem work is
coordinated explicitly before/after it, never hidden in an atomicity claim.
Use small typed command/query APIs, not one service per table or speculative
generic repositories. Keep shared contracts independent of storage, filesystem,
Electron, and React details.

## Catalog and Storage

- The [implemented lookup policy](domain-model.md#implemented-identity-policy)
  reuses Sample UUIDs by canonical source location. Mutable observations live
  separately and observed changes increment a revision. Identity-preserving
  moves/relinking remain planned; separate copies stay distinct.
- Track imported roots and file availability. Keep missing samples in the
  catalog so users can locate or relink them without losing organization.
- Separate observed file metadata, user-edited metadata, and derived analysis.
  Rescanning must not overwrite user classifications with automatic suggestions.
- Keep the authoritative catalog in application-managed local storage under
  Electron's `userData` location, separate from user-selected audio directories.
  A catalog record does not authorize arbitrary disk access.
- The local SQLite catalog uses Drizzle over `better-sqlite3` in a worker, with a distinct
  fresh database path. Node and Electron development integration are validated
  on macOS; native loading/packaging in distributed apps and Windows remain
  unverified. Neither earlier development database is opened or migrated. See
  [Data Access](data-access.md#persistence-foundation) for implementation status.
- Keep storage behind small domain-specific query/update functions. Avoid a
  generic repository framework or exposing storage queries to the renderer.
- Evolve the typed schema through reviewed, committed Drizzle SQL migrations.
  Preserve STRICT tables and atomic migration/bootstrap rollback; never use
  schema push on application data. See the owning [migration conventions](data-access.md#migrations).
  Version the schema and reject unsupported formats
  or versions without resetting data. Backups/recovery for future released
  upgrades remain necessary; they do not require prototype compatibility.
  Keep recoverable analysis caches separate from user data.
- **Implemented internally:** copy validated images into shared managed
  storage for Pack/Collection covers and the UserProfile avatar. Startup cleans unreferenced
  managed copies with retry/reconciliation; never delete originals or referenced
  images. See [Data Access](data-access.md#managed-image-lifecycle).
- **Implemented slice:** imports persist observed size/mtime and increment the
  source revision on observed changes, preserving user organization.
  **Planned:** persistent analysis invalidation and stronger source checks.
  Use content hashing only when needed:
  file names and paths alone cannot establish that two samples are duplicates.
- **Planned:** external moves and edits require reconciliation; filesystem watchers are
  hints, not an authoritative catalog. Start with explicit rescans and add
  watchers when needed. Never silently merge uncertain file identities.

## Safe File Operations (Planned)

The filesystem and catalog cannot share one atomic transaction. Treat their
coordination as a recoverable workflow, not an all-or-nothing database call.

1. **Plan:** resolve authorized sources and destinations; list actions,
   collisions, required space, and affected catalog references.
2. **Review:** show the plan and obtain confirmation and a conflict policy.
   A selected root does not automatically authorize unrelated destinations.
3. **Revalidate:** check source identity, destination conflicts, and permissions
   immediately before each action. A previewed plan may become stale.
4. **Execute:** record intent and per-file outcomes. Never overwrite implicitly.
   For cross-volume relocation, copy to a temporary destination, verify the
   result, finalize it, and delete the source only when safe and authorized.
5. **Reconcile:** update locations without changing stable IDs, invalidate
   derived resources, and report completed, failed, and untouched items.

Cancellation takes effect at safe boundaries and does not undo completed work.
On restart, reconcile interrupted operations against actual disk state before
retrying. Do not promise universal rollback or delete the last valid copy.
Define verification and retry policies with the implementation; tasks must
not blindly repeat a rename, copy, or deletion.

Export produces an explicit output set without relocating originals.
Automatic organization produces a proposal through the same planning pipeline,
not a separate path that bypasses confirmation.

## Classification Suggestions — Agreed Direction (Planned)

This direction is approved but not implemented. Business rules, initial Genre
content, recognition terms, and aliases belong to
[Domain Model](domain-model.md#suggestions-tasks-and-recovery) and its
[Genre section](domain-model.md#genre--agreed-not-implemented).

### Identity and Recognition

- Genres and aliases have stable identities independent of their names. Supplied
  vocabulary and aliases also have stable catalog keys so updates can distinguish
  renamed, removed, and newly offered content without restoring user deletions.
- Re-creating a deleted entry creates a new identity; it does not recover former
  assignments or historical identity. Exact catalog-to-library mapping and
  tombstone representation remain implementation contracts to define.
- Keep the recognition vocabulary separate from library classification records.
  It may recognize a term whose Category/Genre has not yet been created, subject
  to the agreed creation/review rules.
- Use a pure, local, deterministic recognition engine combining supplied
  vocabulary with library names and aliases. It returns proposals and supporting
  evidence; it does not write assignments. Normalization rules are agreed below;
  remaining tokenization edge cases need exact contracts; ambiguity behavior is
  agreed below.
- Evidence identifies the matched term and its filename/folder source or the
  supplying Pack. Combine multiple evidence items into one classification
  proposal. Rejection memory is evidence-based, not just engine-version-based;
  evidence equivalence is agreed below; serialized keys and persistence contracts
  remain open.

### Recognition Ambiguity — Agreed

- Never automatically merge or rename library entries whose distinct names
  normalize to the same recognition phrase, such as Lo-Fi and Lo Fi.
- Creating or changing names and aliases must detect recognition conflicts within
  the same dimension and require explicit resolution. This adds recognition
  validation without changing the agreed name-uniqueness comparison.
- If existing data contains an unresolved conflict, omit that ambiguous match and
  report the conflict while continuing with independent suggestions.
- For partially overlapping phrases where neither fully contains the other,
  omit only the ambiguous matched span and report its possible targets. Preserve
  unambiguous matches elsewhere; fully contained matches retain the agreed
  most-specific-phrase precedence.
- Category and Genre recognition namespaces are independent; matching a term in
  both dimensions is not a conflict.

Exact conflict payloads and migration-time detection remain implementation
contracts. Existing data must remain intact; detection does not authorize cleanup
or silent normalization of user vocabulary.

### Evidence Equivalence and Rejections — Agreed

- Case and equivalent-separator changes do not create new evidence: `TECH-HOUSE`,
  `tech_house`, and `Tech House` represent the same normalized clue.
- Renaming a classification preserves its identity and does not reset rejections.
- A distinct occurrence at a different eligible path location may provide new
  evidence. Rejecting a filename clue does not suppress a later independent clue
  from a newly relevant folder.
- Registering an additional root that exposes the same folder occurrence does
  not duplicate evidence or bypass a rejection.
- Identify Pack-derived evidence by Pack identity and Genre identity. Renaming
  the Pack does not change that evidence; a different Pack can supply new evidence.
- Updating rules or aliases alone does not turn the same clue into new evidence.

Track evidence independently from the rule that recognized it, while retaining
rule provenance for explanation and stale-review validation. Exact serialized
evidence keys, location-change handling, and rejected-target identity before
vocabulary creation still require implementation contracts. This is planned
behavior, not an existing rejection store.

### Process Ownership and Execution

- Renderer owns preparation presentation and the user's staged decisions.
- Main owns operation orchestration, revalidation, and the shared serial queue
  for confirmed imports and standalone classification. This queue does not replace
  worker serialization or schedule every catalog mutation.
- The DB worker owns bounded queries, transactional writes, durable execution
  history, and recovery records. Main coordinates recovery through those records.
- Preload exposes narrow typed operations. Validate renderer decisions against
  the prepared review and current authoritative state; never trust proposed
  identities, evidence, or paths merely because they arrive in a typed request.
- Preserve the per-target atomicity, Pack dependencies, cancellation, queue,
  interruption, and import-specific failure policies agreed in Domain Model.
  Concrete schema, review tokens, journal checkpoints, IPC payloads, and bounded
  execution limits require definition before their respective implementation.

### Incremental Delivery

1. Genre operations, alias management, and the pure recognition engine.
2. Standalone classification preparation, review, and confirmed execution.
3. Integration with reviewed import, the shared queue, and interruption recovery.

Each delivered workflow must honor its agreed persistence and recovery rules;
this outline does not authorize shipping an execution path without them. Preserve
existing preview, Favorites, and authorized native dragging throughout delivery.

### Verifiable Execution Recovery — Agreed (Planned)

- Persist each confirmed import/classification operation and its reviewed
  decisions before execution starts.
- Record each Sample/Pack's committed outcome in the same database transaction
  as its changes. Coupled Pack/first-Sample creation must record both outcomes
  with their shared transaction. Do not leave applied changes without their
  corresponding committed result.
- On restart, use those records to distinguish completed, failed, and unprocessed
  targets. Mark outcomes that cannot be established as unverified and block
  their retry until reconciliation finishes.
- Never resume automatically or treat execution history as an undo mechanism.

These guarantees cover database-backed import and classification, not future
filesystem moves or exports, which need additional coordination. Exact journal
schema, preparation payload bounds, interruption checkpoints, and reconciliation
queries remain executable contracts to define. Neither a progress event nor a
renderer acknowledgement is proof of a committed database outcome.

## Analysis, Search, and Large Libraries

- **Agreed, planned:** measure and persist observed duration in background after
  import, without blocking import on library-wide decoding. Unknown duration
  stays unknown until measured. Bind observations to source versions and
  invalidate them on source change; reject stale analysis results. Extraction,
  scheduling, retry, and storage contracts remain open, separately from musical
  BPM/key analysis and the existing preview/waveform duration.
- Duration failures retain the Sample and organization with unknown duration and
  a separate analysis error, without changing a completed import's outcome.
  Support explicit retry and retry on detected new source versions; avoid endless
  retries for the same version. Duration, waveform, and preview outcomes remain
  independent; exact retry scheduling and error contracts need definition.
- Gradually include previously imported Samples lacking duration in the same
  background scheduler, without reimport and under the same pause/priorities/limits.
  Distinguish source unavailability from decoding errors. An authorized check or
  rescan verifying restored access permits retry of an unavailability failure on
  the same source version, respecting pause; do not continuously poll. Decoding
  failures still need explicit retry or a new source version.
- Background duration measurement supports pause/resume, prioritizes explicit
  requests, and bounds queued/active work without blocking main or overwhelming
  preview. Stop safely on exit; automatically resume pending work after restart
  unless the user left measurement paused. Persist that pause choice. Resumption
  alone does not retry same-version failures; verified access restoration follows
  the exception above. It does not change manual continuation rules for
  import/classification. Exact scheduler, resource budgets, and checkpoints remain
  contracts to define.
- Preserve lazy waveforms, bounded caching, and a single preview player.
  Current browser decoding remains appropriate for short samples.
- **Planned:** move expensive analysis to a bounded worker or Electron utility
  process when profiling shows a need. Do not run CPU-heavy decoding, hashing,
  or classification in the main event loop.
- Distinguish codec support for listing, metadata extraction, waveform decoding,
  preview playback, and the destination DAW. A supported extension guarantees
  none of the other capabilities.
- Keep sample rate, channels, duration, analysis version, and source version
  available to invalidate stale results. Missing/failed analysis is a state,
  not zero-valued metadata.
- **Planned:** search the catalog across imported roots, not only the currently
  displayed folder. Use indexed fields, stable ordering, and pagination; add
  full-text indexing when its requirements justify it.
- Approximate library search follows the agreed baseline in
  [Global Search](ux-design.md#global-search--agreed-interaction): query words of
  at least four characters, one edit or adjacent transposition, no approximate
  numeric/short-term matches, all words required, and approximate results last.
  Validate against real examples before implementation; this does not loosen
  deterministic classification recognition or expand recognition aliases.
- Within each search relevance tier, use the agreed deterministic tie-breakers:
  fewer approximate words, lower total edit distance, normalized name, entity
  type, then stable ID. Do not add Favorite or recency weighting. Define cursor
  and snapshot behavior against this ordering before implementing pagination.
- Main validates search requests; the DB worker executes catalog queries without
  transferring the whole library to renderer. Wait 250 ms after typing stops
  before querying and reject stale responses in the owning renderer context.
- Return at most five suggestions per entity type, with access to full results.
  Full-result pages default to 50 records, maximum 100 per request, following the
  agreed relevance and tie-break ordering. Validate these initial limits against
  representative libraries before implementation.
- On refresh failure, retain the last valid results with an explicit failure
  state. Query correlation, pagination cursors, catalog-change behavior, and
  bounded approximate-match execution remain technical contracts to define.
- Relevant catalog changes do not automatically reorder displayed search results;
  expose available changes and offer refresh. If they invalidate pagination,
  reject continuation rather than mixing catalog versions. Refresh starts at the
  first page with the same query/filters and preserves valid selection. Mutations
  revalidate current state; this is not a full retained query snapshot. Exact
  invalidation scope and cursor/version tokens remain implementation contracts.
- **Planned:** return scan results and progress in batches, and virtualize large
  lists so offscreen rows do not all create components or observers.
- Bound queued and active work, not just concurrency. Deduplicate repeated
  analysis requests by sample/source version and prioritize visible or
  explicitly requested samples.

## Native and Platform Integration

- Resolve native drag identifiers to authorized, available real files in main.
  Start dragging within the gesture; keep synchronous checks small.
- Neither preview URLs nor copied temporary samples should replace the original
  file in a normal DAW drag. Export remains a separate workflow.
- Use platform-aware path utilities and isolate OS-specific behavior. Account
  for Windows naming restrictions, case sensitivity, locked files, macOS
  permissions, removable drives, and cross-volume moves.
- Audio preview and dragging must continue to work offline. Restrict local
  protocols and content security policy to the resources they need.
- Native dependencies, installers, signing, and updates need validation on
  macOS and Windows. Do not claim minimum OS or CPU support before testing it.

## Evolution and Validation

Deliver vertical slices in this order when their requirements are agreed:

1. Clean typed entity contracts and worker-owned `better-sqlite3` foundation.
2. All agreed organization entities, local profile/Preferences, independent
   credits, source workflows, Favorites, managed covers/avatars, narrow IPC, and
   connected UI; preserve preview and native dragging.
3. Persistent technical analysis and waveform peaks with source invalidation.
4. Planned, recoverable export and file organization tasks.
5. Reviewed automatic organization and measured performance improvements.

This is an architectural dependency outline, not a committed release schedule.
Do not implement all layers or reorganize the application just to match it.

For each slice, test domain rules, storage/filesystem failures, IPC boundaries,
and the UI workflow. Recovery tests must include interruption and stale plans.
Use real audio fixtures and representative large libraries to measure load time,
memory, and responsiveness; agree measurable budgets before claiming scalability.
Native DAW reception still requires manual validation on each target platform.

Document accepted storage, identity, and operation policies here as they become
concrete. Keep detailed feature behavior in its owning documentation rather
than turning this guide into a changelog.
