# Feature Development

Read this guide when adding or extending a Kiter feature end to end.
It is a workflow and delivery checklist, not a second source of domain,
architecture, component, or testing rules.

Read [Common Guidelines](common-guidelines.md) first, then the relevant guides:
[Domain Model](domain-model.md), [Architecture](architecture.md),
[Component Organization](component-organization.md), and
[Testing Conventions](testing-conventions.md).

## Feature Shape

A feature is a vertical slice of user behavior, not necessarily a folder in
every process. Add only the surfaces needed:

| Surface | Add or change when |
| --- | --- |
| `src/shared/` | The feature changes serializable cross-process contracts. |
| `src/main/services/` | Privileged operations, domain workflows, or filesystem behavior are needed. |
| `src/main/ipc/` | The renderer needs a new or changed main-process operation. |
| `src/preload/` | A narrow typed method or removable event subscription must be exposed. |
| `src/renderer/src/features/<feature>/` | Feature UI, presentation state, hooks, or renderer helpers are needed. |
| `tests/` | Behavior needs unit, filesystem, or Electron integration coverage. |

Extend existing owners before introducing new modules. Do not create schemas,
routes, providers, barrels, or a persistence layer just to complete a template.
Pure UI changes may need no IPC; filesystem changes may need no new component.

## Delivery Checklist

### 1. Scope and Acceptance Criteria

- [ ] Describe the user action and its observable successful result.
- [ ] Identify loading, empty, failure, cancellation, and retry behavior where relevant.
- [ ] Distinguish read-only analysis and catalog edits from audio file mutations.
- [ ] Confirm consequential product decisions rather than inventing defaults:
      membership rules, destinations, conflict policies, or destructive behavior.
- [ ] Identify macOS/Windows differences and manual checks the feature needs.
- [ ] Define measurable limits when performance is part of the requirement.

Use [AGENTS.md](../../AGENTS.md) to distinguish existing behavior from roadmap
items. A planned feature does not authorize implementing adjacent features.

### 2. Domain and Contracts

- [ ] Inspect existing types, callers, services, and tests for prior art.
- [ ] Define the smallest required input, result, and error contracts.
- [ ] Preserve stable identity and references when persistent entities exist.
- [ ] Keep observed metadata, user edits, and suggestions distinguishable.
- [ ] Decide whether progress events, task IDs, or pagination are actually needed.
- [ ] Specify boundary validation; TypeScript types alone do not validate IPC.

Follow [Domain Model](domain-model.md). Do not introduce speculative complete
entities or duplicate contracts across processes.

### 3. Main Process and Preload

- [ ] Implement the operation in its owning service; keep handlers thin.
- [ ] Validate the caller, inputs, and authorized source/destination scope.
- [ ] For file mutation, implement reviewable planning and explicit confirmation.
- [ ] Account for stale sources, conflicts, partial failure, and safe cancellation.
- [ ] Bound processing and expose progress for substantial background work.
- [ ] Wire shared channels, registration, and typed preload methods where required.
- [ ] Provide removable event subscriptions without exposing Electron event objects.
- [ ] Surface failures with operation context and actionable UI feedback.

Follow [Architecture](architecture.md) for boundaries and recoverable file
operations. Do not add generic filesystem methods or bypass the typed bridge.

### 4. Renderer and User Feedback

- [ ] Connect the workflow through its owning feature hook/controller where useful.
- [ ] Compose components according to [Component Organization](component-organization.md).
- [ ] Write user-facing text in English and keep accessible names meaningful.
- [ ] Distinguish an empty library, no matching results, and a failed read.
- [ ] Prevent conflicting repeated actions while preserving intended interactions.
- [ ] Keep recoverable input and the last valid state when an operation fails.
- [ ] Clean up subscriptions, observers, requests, and media resources.
- [ ] Preserve lazy analysis, bounded caches, and a single preview player.
- [ ] Report success only after the operation has actually succeeded.

Navigation, forms, and providers are added only when the workflow requires them.
Do not assume an entity registry, router, query client, or UI framework exists.

### 5. Tests and Platform Validation

- [ ] Reuse fixtures and cover observable success and relevant failure paths.
- [ ] Test cancellation, stale results, cleanup, and partial outcomes when affected.
- [ ] Use temporary files for filesystem tests and valid audio for decoding/playback.
- [ ] Exercise the real preload/main/UI path when changing process contracts.
- [ ] Verify required results and thresholds, not only that a mock was called.
- [ ] Run focused tests first, followed by applicable type/lint/build checks.
- [ ] Record macOS/Windows results separately and explain platform-specific skips.
- [ ] Manually check DAW reception when changing native dragging; a mocked
      `startDrag` does not prove a real drop works.

Use the commands and isolation rules in
[Testing Conventions](testing-conventions.md). Do not add a test runner solely
to follow patterns from another repository.

### 6. Documentation and Delivery

- [ ] Update documentation that owns the changed user-facing behavior.
- [ ] Keep implemented and planned capabilities clearly distinguished.
- [ ] Update architecture/domain guidance only when its conventions or decisions change.
- [ ] Report what changed, validation performed, and remaining limitations.
- [ ] Do not claim codec, platform, DAW, recovery, or scalability support beyond
      the evidence collected.

A feature is complete when its intended workflow is connected, persistent where
required, and verified. Persistence is not a requirement for every feature.
Creating a UI shell or a service method alone does not complete an end-to-end ask.

## Working Example: Library, Preview, and Native Drag

Follow the existing implementation rather than maintaining a simplified parallel
example in this guide:

1. [Shared contracts](../../src/shared/ipc.ts) describe the current folder,
   sample, and drag-facing API.
2. [Library service](../../src/main/services/library.ts) discovers audio recursively.
3. [Library handlers](../../src/main/ipc/library.ts) connect discovery and
   catalog imports, favorite writes, and native dragging, resolving authorized
   samples to real files.
4. [Audio service](../../src/main/services/audio.ts) authorizes session sample
   URLs and streams local audio.
5. [Preload](../../src/preload/index.ts) exposes the explicit bridge methods
   and a removable drag-error listener.
6. [Library hook](../../src/renderer/src/features/library/uselibrary.ts) owns
   folder selection, loading, favorite updates, and the last successfully loaded list.
7. [File list](../../src/renderer/src/features/library/FileList.tsx) composes
   rows, favorite controls/filter, shared preview, and native drag initiation.
8. [Waveform component](../../src/renderer/src/features/library/Waveform.tsx)
   and [waveform processing](../../src/renderer/src/features/library/waveformData.ts)
   provide visible-row analysis, drawing, and bounded cached results.
9. [Library tests](../../tests/library.test.ts),
   [waveform tests](../../tests/waveform.test.mjs), and
   [Electron integration](../../tests/library.electron.mjs) verify their respective
   layers, including native drag payloads rather than actual DAW reception.

This example demonstrates wiring and ownership, not a guarantee that every
current implementation detail meets future catalog requirements. Its session
URLs are not persistent IDs. The [catalog store](../../src/main/services/catalogStore.ts)
persists UUIDs and favorites; [catalog tests](../../tests/catalog.test.ts) and
[restart verification](../../tests/favorites-restart.mjs) cover that slice.
