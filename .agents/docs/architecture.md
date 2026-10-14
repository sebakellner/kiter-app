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

| Layer | Current responsibility |
| --- | --- |
| [Main entry point](../../src/main/index.ts) | Application lifecycle, protocol registration, IPC registration, and window creation. |
| [Main IPC](../../src/main/ipc/library.ts) | Authorized folder import, favorite writes, and native drag requests. |
| [Catalog](../../src/main/services/catalog/index.ts) | Asynchronous worker requests and shutdown ownership. |
| [Catalog store](../../src/main/services/catalog/catalogStore.ts) | SQLite schema v1, transactional imports, durable identities, and favorites, executed in a worker. |
| [Library service](../../src/main/services/library/index.ts) | Recursive audio discovery, canonical folder preparation, and catalog import coordination. |
| [Audio service](../../src/main/services/audio/index.ts) | In-memory authorization of the loaded library and local audio streaming. |
| [Preload](../../src/preload/index.ts) | Typed methods exposed through `contextBridge`. |
| [Shared contracts](../../src/shared/ipc.ts) | Channels, request-facing API, and sample transfer types. |
| [Library UI](../../src/renderer/src/features/library/components/FileList/index.ts) | Sample rows, current-folder favorite filter, shared preview, and native dragging. |
| [Waveform processing](../../src/renderer/src/features/library/components/Waveform/waveformData.ts) | Serialized, cancellable decoding and bounded peak caching. |

The folder view remains session-scoped, while sample UUIDs and favorites persist
in SQLite under `userData`. Sample URLs are temporary capabilities, not durable
sample identities. There is no task journal, kit model, global search index,
automatic restore of the selected folder, or relocation/relinking workflow.
See [Data Access](data-access.md#implemented-catalog-and-favorites) for storage,
driver, schema, failure behavior, and backup limitations.

### Service Modules

- Group each service by responsibility under `src/main/services/<service>/`.
  Keep its implementation, private helpers, and internal types together.
- Each module has a small `index.ts` with explicit public exports. Application
  consumers import the service folder; internal files use direct relative
  imports rather than their own barrel. Do not add a global services barrel.
- The catalog exports only `Catalog`. Its store, worker messages, and worker
  entrypoint remain internal; importing the public API must not load SQLite
  or execute worker startup in the main process.
- The catalog worker remains a separate bundler entry, emitted beside the main
  bundle. Moving its source must preserve the client's runtime worker path.
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
    +-- catalog worker -> SQLite (serialized imports and favorite writes)
    +-- bounded background analysis when required

Authorized audio protocol -> streamed bytes -> preview / waveform consumer
```

- Renderer must not import main-process implementations or receive generic
  filesystem or IPC access. Shared contracts contain serializable data, not
  Electron objects, database handles, or decoded audio buffers.
- Keep IPC handlers thin: validate the caller and input, invoke an operation,
  and translate its outcome. Domain and filesystem behavior belongs in services.
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

| Responsibility | Owns |
| --- | --- |
| Library/catalog | Imported roots, stable sample identities, file locations, availability, and rescanning. |
| Kits | Kit metadata, cover references, and sample membership. |
| Classification | Categories, tags, declared owners, and reviewable organization suggestions. |
| Favorites | Favorite marks and named lists referencing sample identities. |
| Analysis | Technical metadata, waveform peaks, processing status, and derived-data invalidation. |
| Search | Global catalog queries and filters across samples and related metadata. |
| File operations | Rename, relocate, centralize, and export plans and their execution. |
| Tasks | Bounded scheduling, progress, cancellation, and recoverable operation records. |

Services may call each other through explicit operations; avoid circular
dependencies. Components must not independently implement catalog mutations
or filesystem conflict resolution.

Kits and favorite lists reference sample IDs, not copies of files. Importing a
folder and creating a kit are distinct operations: neither implies relocation.
Centralization is a separate, user-approved file operation.

## Catalog and Storage

- Sample UUIDs are implemented with the initial
  [canonical-location policy](domain-model.md#implemented-identity-policy).
  Kit IDs and identity-preserving file operations remain planned.
- Track imported roots and file availability. Keep missing samples in the
  catalog so users can locate or relink them without losing kit/favorite data.
- Separate observed file metadata, user-edited metadata, and derived analysis.
  Rescanning must not overwrite user classifications with automatic suggestions.
- Keep the authoritative catalog in application-managed local storage under
  Electron's `userData` location, separate from user-selected audio directories.
  A catalog record does not authorize arbitrary disk access.
- The local SQLite catalog uses Electron's built-in experimental `node:sqlite`
  in a worker. Development integration is validated on macOS; worker loading,
  driver support, and packaging still need validation in distributed apps on
  both target platforms.
- **Approved, not implemented:** retain SQLite and the catalog worker, replacing
  `node:sqlite` with `better-sqlite3` before domain-schema expansion. See
  [Data Access](data-access.md#approved-persistence-direction-planned) for
  transition and native-addon validation requirements.
- Keep storage behind small domain-specific query/update functions. Avoid a
  generic repository framework or exposing storage queries to the renderer.
- Schema v1 is versioned; newer schemas fail without resetting user data.
  Backup/recovery UX and future migrations remain release work. Keep recoverable
  analysis caches separate from user data.
- **Planned:** store cover assets in an app-managed location when imported; reference them
  from kits. Cache thumbnails and validate file type/size before processing.
- **Planned:** detect file changes using observed size/time/version information. Invalidate
  derived data when a source changes. Use content hashing only when needed:
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

## Analysis, Search, and Large Libraries

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

1. Persistent catalog and stable identity.
2. Kits, cover assets, classification, favorites, and global queries.
3. Planned, recoverable export and file organization tasks.
4. Reviewed automatic organization and measured performance improvements.

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