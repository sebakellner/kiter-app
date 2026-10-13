# Common Guidelines

Read these guidelines before changing source code or tests in Kiter.
Use the [agent documentation index](../../AGENTS.md) for product context,
architecture, file integrity rules, and validation commands.

## Scope and Reuse

- Follow [Component Organization](component-organization.md) when creating
  or reorganizing React components, private pieces, and public exports.
- Follow [Service Modules](architecture.md#service-modules) when creating
  or reorganizing main-process services, their internal files, and public APIs.
- Inspect the existing implementation and its callers before editing. Make
  complete, task-focused changes without unrelated refactoring.
- Search for existing services, hooks, components, types, and utilities before
  adding alternatives. Extract shared code only when there is actual reuse.
- Keep feature-specific UI and hooks in the owning renderer feature, filesystem
  behavior in main-process services, and cross-process contracts in shared.
- Prefer small, explicit modules over generic frameworks or configuration layers.
  Do not introduce dependencies or architecture from another project.
- Planned features are not existing contracts. Clarify consequential domain
  choices before adding persistence, classification rules, or bulk operations.

## Imports and Contracts

- Use configured aliases such as `@shared` and `@renderer` where available.
  Relative imports within a feature or main-process service are appropriate.
- Use `import type` for type-only imports. Reuse shared contracts instead of
  duplicating their shapes in preload, hooks, or components.
- Keep shared modules independent of Electron runtime APIs and React.
- Wire contract changes through main, preload, renderer, and affected tests.
  Keep TypeScript includes and bundler aliases consistent with those imports.
- Avoid filenames that differ only in casing, including across extensions.
  Imports must work on both case-sensitive and case-insensitive filesystems.

## Cross-Platform Behavior

- Follow the [target platform scope](../../AGENTS.md#target-platforms).
  Keep filesystem and native integration code compatible with macOS and Windows.
- Use Node.js path and URL utilities rather than concatenating separators or
  constructing file URLs manually. Handle spaces, Unicode, drive letters,
  case sensitivity, permissions, and platform-specific filename restrictions.
- Do not hardcode user directories, shell commands, or macOS-only APIs for
  shared workflows. Isolate necessary platform differences in the main process.
- Validate native dragging and audio behavior on each target OS when possible.
  State untested platforms explicitly; mocks and a successful build do not
  prove interoperability with a DAW.

## Types and Input Validation

- Preserve type safety. Avoid `any`, suppression directives, and casts that
  hide missing validation or mismatched contracts.
- Treat IPC arguments, filesystem contents, and extracted metadata as external
  inputs. Validate them at the boundary before performing privileged operations.
- Expose narrow, typed preload methods. Do not expose generic IPC channels,
  arbitrary file reads, or Electron event objects to the renderer.
- Keep IPC channel names in the [shared contract](../../src/shared/ipc.ts).
  Resolve sample identifiers against the authorized library rather than
  trusting a renderer-supplied path.
- Distinguish unsupported audio, missing files, invalid input, and operation
  failures. Do not substitute invented metadata or success-shaped defaults.

## State and Resource Ownership

- Use React state for presentation and feature hooks for reusable workflows.
  Keep privileged filesystem and native operations in the main process.
- Maintain one owner for each resource and its lifecycle: player, decoder,
  observer, subscription, cache, and pending operation.
- Clean up listeners, observers, media sources, and buffers when their owner
  unmounts or its inputs change.
- Handle cancellation and stale results explicitly. A completed request must
  not overwrite state for a newer selection or report errors after cancellation.
- Keep caches bounded and concurrency limited. Do not eagerly read or decode
  the entire sample library to render the list.
- Intentional persistence belongs in its owning module. Do not use browser
  storage as an implicit database or assume a persistence layer exists.

## UI, Forms, and Feedback

- Keep components focused on composition and presentation. Extract substantial
  event logic when doing so improves ownership, readability, or testability.
- Reuse existing CSS classes and theme tokens. Do not introduce a UI library,
  icon system, form framework, or localization framework without a task need.
- Kiter's first release is English-only. Write all user-facing text in English,
  including labels, dialogs, tooltips, accessible names, statuses, and errors.
  Translate existing Spanish wording when updating those surfaces rather than
  preserving it. Keep technical documentation, agent guidance, and code comments
  in English as well. Reuse consistent terminology before adding variants.
- Group repeated user-facing text in the owning feature when useful; do not
  extract every literal or impose a new localization structure unnecessarily.
- Use semantic controls, meaningful accessible names, keyboard behavior, and
  visible loading, empty, pending, and error states.
- Derive form fields and validation from agreed domain contracts, not mockups
  alone. Do not invent required values to make a submission succeed.
- Close dialogs, reset forms, or report success only after the operation succeeds.
  Preserve recoverable user input and the last valid state on failure.

## Errors and File Operations

- Catch errors at boundaries that can log or present them meaningfully.
  Do not silently swallow failures, return empty results for failed reads,
  or label partially completed work as successful.
- Log main-process failures with operation context and provide consistent,
  actionable user-facing feedback through the typed bridge. Apply the
  [logging policy](#logging-and-privacy) rather than dumping raw error objects.
- Keep expected cancellation separate from failure. A queue may recover from
  rejection only if the original caller still receives the error.
- Follow the [file integrity rules](../../AGENTS.md#file-and-data-integrity)
  for renaming, moving, centralizing, and exporting. Never silently overwrite
  originals or choose a duplicate-resolution policy.
- Keep synchronous filesystem work out of normal UI workflows. Small checks
  needed to start a native drag within its gesture are an explicit exception;
  do not expand them into scanning, decoding, or bulk mutation.

## Logging and Privacy

- Log operation names, error codes, and minimal correlation identifiers.
  Do not log audio content, decoded buffers, credentials, full IPC payloads,
  or unnecessary personal paths, filenames, kit data, or owner information.
- Sanitize filesystem errors and stack traces before logging or exporting:
  raw error objects can contain absolute paths and usernames. Prefer catalog
  or task IDs where available; session identifiers are not a reason to dump data.
- Keep actionable location details in the relevant local UI when needed for
  recovery, rather than automatically copying them into diagnostic logs.
- Avoid per-frame or per-sample logging in normal operation. Bound message
  sizes and repeated-error frequency; if file logging is introduced, configure
  rotation and explicit storage/retention limits rather than unlimited growth.
- Diagnostic export or remote reporting requires explicit user approval,
  redaction, and a clear explanation of included data. Do not introduce telemetry
  or uploads as an incidental feature change.
- These are development requirements. Existing console logging has not been
  migrated to a centralized, redacted, bounded logging system.

## Validation and Documentation

- Follow [Testing Conventions](testing-conventions.md) for test commands,
  fixtures, isolation, integration coverage, and manual validation.
- Run commands from the repository root using existing pnpm scripts.
  See [Development and Validation](../../AGENTS.md#development-and-validation).
- Start with focused tests, then validate the affected integration surfaces.
  Keep TypeScript checks and ESLint passing.
- Cover observable success, failure, cancellation, cleanup, and stale-result
  behavior where relevant. Test measurable results, not just mock calls.
- Use temporary directories for filesystem tests and clean up fixtures.
  Use real audio fixtures for decoding and playback integration tests.
- Distinguish automated coverage from manual validation. A mocked native
  drag verifies the bridge and payload, not actual reception by a DAW.
- Remove temporary debugging output. Keep meaningful error logging.
- Update directly related documentation. Use comments only to explain
  non-obvious decisions, constraints, or lifecycle behavior.

## Documentation Ownership

- [AGENTS.md](../../AGENTS.md) owns product context, the guide index, and
  repository-wide safeguards. [Architecture](architecture.md) owns process
  boundaries and architectural evolution. This guide owns common coding rules.
  [Domain Model](domain-model.md) owns entity semantics and lifecycle invariants.
  [Testing Conventions](testing-conventions.md) owns test execution and isolation.
  Avoid maintaining duplicate versions of the same guidance.
- Add topic guides incrementally when requested. Index only existing files,
  and do not create empty guides or speculative documentation scaffolding.
- Agent guidance is not a feature changelog. Document user-facing behavior
  and limitations in the [README](../../README.md) or existing feature docs.
- Generic guides document shared conventions, not individual component APIs,
  defaults, CSS classes, or implementation details. Keep component-specific
  documentation with its owning module when needed; simple components may be
  sufficiently documented by their types, implementation, and tests.
- Keep implementation status accurate; do not describe roadmap items as shipped.
