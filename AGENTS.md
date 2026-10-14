# Kiter

## Documentation Index

Read [Common Guidelines](.agents/docs/common-guidelines.md) before changing
source code or tests. Use the sections below for product context, architecture,
file integrity, and validation.
Read [Testing Conventions](.agents/docs/testing-conventions.md) before changing
tests, fixtures, mocks, or validation workflows.

| Guide                                                            | Read when                                                                                                                               |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| [Common Guidelines](.agents/docs/common-guidelines.md)           | Changing code or tests: organization, reuse, imports, contracts, types, state, resource cleanup, UI, and errors.                        |
| [Component Organization](.agents/docs/component-organization.md) | Creating, splitting, sharing, or moving React components, their private pieces, exports, and resource ownership.                        |
| [Architecture](.agents/docs/architecture.md)                     | Changing process boundaries, domain responsibilities, persistence, filesystem workflows, background processing, or native integrations. |
| [Domain Model](.agents/docs/domain-model.md)                     | Changing entities, identities, relationships, metadata, lifecycle behavior, or domain validation.                                       |
| [Testing Conventions](.agents/docs/testing-conventions.md)       | Adding or changing tests, fixtures, mocks, validation commands, or platform and DAW verification.                                       |
| [Feature Development](.agents/docs/feature-development.md)       | Adding or extending a feature end to end: scope, contracts, main/preload, UI, validation, and delivery.                                 |
| [UI Patterns](.agents/docs/ui-patterns.md)                       | Changing interactions, forms, dialogs, accessibility, or user feedback.                                                                 |
| [Data Access](.agents/docs/data-access.md)                       | Changing IPC, local data queries, mutation feedback, or persistence.                                                                    |
| [Release Process](.agents/docs/release-process.md)               | Packaging, validating, or distributing macOS and Windows releases.                                                                      |

Add guides incrementally when requested. Keep shared coding rules in their
owning guide and index only files that exist; do not create additional guides
or documentation scaffolding ahead of an agreed need.

## Purpose

Kiter is a desktop application targeting macOS and Windows that organizes a music
producer's local sample library. It helps users discover, preview, classify, and
organize imported packs and create collections,
centralize files scattered across their computer, and drag them into a DAW that
accepts external audio files.

The primary workflow is: import folders, analyze samples, organize them, create
collections, and use or export them without losing the original files.
Audio and its organization must be manageable locally; do not introduce remote
service dependencies without an explicit need and approval.

## Target Platforms

- macOS and Windows are the target desktop platforms. Linux is outside the
  current product scope, even if existing tooling includes Linux build targets.
- Preserve equivalent core workflows on both platforms, including local file
  organization, audio preview, and native drag and drop.
- Do not assume a feature validated on macOS also works on Windows, or vice
  versa. Report which platforms were tested and any remaining validation gaps.
- Minimum OS versions and supported CPU architectures must be agreed and
  validated before claiming release support.

## Product Scope

These features define Kiter's direction; they are not all implemented:

- **Packs:** register imported source packages and edit their name, description,
  cover image, Categories, and Author credits.
- **Collections:** assemble ordered selections of references to Samples from
  different Packs and standalone Samples, without duplicating audio.
- **Classification:** organize Samples and Packs with shared Categories and
  credit Samples and Packs independently with reusable Authors. Do not confuse this information with
  user accounts or infer usage rights.
- **Local profile:** one editable UserProfile with an optional Author link and
  managed avatar, plus typed Preferences initially storing preview volume.
  There is no login, multi-profile scope, or automatic attribution.
- **Files and export:** export Samples or groupings, rename files, and keep their
  data and references consistent.
- **Centralization:** gather and relocate samples into a local folder chosen
  by the producer, with directories organized by sample type.
- **Global search:** find samples across the application's library, including
  their Packs, Collections, Categories, and available data.
- **DAW integration:** drag original files using native drag and drop while
  retaining preview playback within Kiter.
- **Analysis:** extract technical audio metadata, such as duration, waveform,
  sample rate, and channels. Do not invent metadata or musical inferences.
- **Favorites:** mark Samples independently of grouping membership. Named
  favorite lists, Tags, and possible future Kits are outside the agreed first
  entity delivery.
- **Automatic organization:** suggest classifications and groupings for
  unstructured sample folders, and allow users to review the result before
  modifying files.
- **Tasks:** generate and consolidate analysis, organization, renaming,
  relocation, and export operations with visible status and errors.
  Define their concrete behavior when implementing them; this does not imply
  audio synthesis or generation.

## Current State

The existing foundation includes recursive folder scanning, extension-based
filtering, a sample list, on-demand waveforms and duration, preview playback
with a shared player, and native dragging of one file per gesture. A local SQLite
database stores stable Sample UUIDs resolved through canonical source records
and favorites; the current-folder
favorites filter and marks survive reopening the folder after an app restart.

The fresh Drizzle/`better-sqlite3` foundation is implemented with 17 typed schema tables,
shared domain contracts, transactional profile/Preferences bootstrap, and a
worker connected to existing import/Favorite workflows, reviewed migrations and
validated IPC result envelopes. Both earlier development databases are not opened,
migrated, or deleted. This does not authorize automatic
deletion/reset of local databases or source files. See
[Domain Model](.agents/docs/domain-model.md) and
[Data Access](.agents/docs/data-access.md) for the target design and delivery order.

Profile/settings UI and player volume restoration, Pack/Collection operations
and editors, managed image workflows, classification/credit operations, global
search, named favorite lists, centralization, export, and automation remain
planned. Schema/types alone do not deliver those features.

Consult the [README](README.md) for current behavior, formats, limitations, and
setup. Update this distinction as features are delivered.

### Goals Versus Implementation and Validation

| Area            | Desired convention or release goal                              | Current state                                                                                                                                                                                                                     |
| --------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language        | English-only first release, documentation, and code comments.   | Library UI and errors, README, and agent guides are in English.                                                                                                                                                                   |
| Persistence     | A durable local catalog with stable sample identities.          | Fresh 17-table Drizzle/`better-sqlite3` database in a worker, committed migrations, separate Sample/source records and profile bootstrap. Development databases are not imported; relinking and folder restoration remain absent. |
| Platforms       | Equivalent core workflows on macOS and Windows.                 | Automated development validation has been performed on macOS; Windows and packaged-app validation are not established by this documentation.                                                                                      |
| Native dragging | Real-file import into compatible DAWs on both target platforms. | The Electron test substitutes `startDrag`; automated payload checks do not establish actual DAW reception.                                                                                                                        |

Instructions describe the intended standard, not proof of implementation.
Record validation evidence before updating support claims; a build target,
dependency, or passing mock is not sufficient.

## Domain Concepts

See [Domain Model](.agents/docs/domain-model.md) for entity responsibilities,
relationships, invariants, and decisions to resolve before implementation.

Samples are cataloged audio resources; Packs record their origin and Collections
organize references to them. Categories, Author credits, technical metadata, and task outcomes have distinct
ownership. The domain guide owns detailed semantics and pending product decisions.

## Architecture and Organization

Kiter uses Electron, React, and TypeScript; it is not a web monorepo.

- [src/main](src/main): filesystem access, services, dialogs, local protocols,
  and native operating system integration.
- [src/main/db](src/main/db): private typed schema, connection, migrations,
  operations and worker; public `DbClient` is infrastructure, not a domain entity.
- [src/preload](src/preload): a minimal, typed bridge between Electron and the
  UI. Expose specific operations, not generic filesystem or IPC access.
- [src/shared](src/shared): shared contracts and types. Keep them independent
  of UI dependencies and main-process services.
- [src/shared/ipc](src/shared/ipc): domain-specific channels, named request DTOs
  and validated `IpcResult<T>` envelopes; separate from DB rows and worker protocol.
- [src/renderer/src](src/renderer/src): React UI, presentation state, and
  features organized by domain.
- [tests](tests): library, audio processing, and integration tests.

Follow [Common Guidelines](.agents/docs/common-guidelines.md) for coding
conventions and [Architecture](.agents/docs/architecture.md) for process
boundaries and architectural evolution. Keep product context and
repository-wide safeguards here; expand topic documentation incrementally.

When creating or reorganizing main-process services, follow
[Service Modules](.agents/docs/architecture.md#service-modules): one folder per
responsibility with a small explicit public API, not a global services barrel.

## File and Data Integrity

- Importing, analyzing, previewing, and marking favorites must not modify audio.
- Renaming, moving, centralizing, or exporting requires an explicit user action.
  Show sources, destinations, and conflicts before destructive operations.
- Never silently overwrite or delete originals. For duplicate names, ask for
  a conflict resolution policy rather than choosing one implicitly.
- Update library, kit, and favorite references when paths change. If an
  operation partially fails, report which files changed and which did not;
  do not present the batch as successful.
- Do not follow symbolic links without an explicit policy that prevents cycles
  and access outside the selected scope.
- Restrict audio access and dragging to authorized library samples. Do not
  accept arbitrary paths from the renderer.
- Distinguish technical file metadata, user-edited data, and automatic
  suggestions. Do not present a suggestion as verified information.

## Performance and User Experience

Keep large-library work bounded, preview coordinated, and operation feedback
explicit. Follow [Architecture](.agents/docs/architecture.md#analysis-search-and-large-libraries)
for processing strategy, [Component Organization](.agents/docs/component-organization.md#state-resources-and-accessibility)
for resource ownership, and [UI Patterns](.agents/docs/ui-patterns.md) for interaction.

## Logs and Privacy

Keep diagnostics useful without exposing producer data. Follow
[Logging and Privacy](.agents/docs/common-guidelines.md#logging-and-privacy)
for redaction, bounded logging, and diagnostic sharing. This is a required policy,
not a claim that current logging already implements all safeguards.

## Development and Validation

Use pnpm and keep [pnpm-lock.yaml](pnpm-lock.yaml) up to date. See
[package.json](package.json) for current commands and dependencies.

```bash
pnpm install --frozen-lockfile
pnpm dev             # Electron app in development
pnpm typecheck       # Main/preload and renderer types
pnpm lint            # ESLint
pnpm test            # node:test tests, not watch mode
pnpm test:app        # Build and Electron integration test; requires a desktop
pnpm build           # Type checking and production build
pnpm db:generate     # Generate migrations from typed schema; review SQL before committing
pnpm db:check        # Validate migration metadata
```

- TypeScript 7 provides `tsc` through `@typescript/native`. The `typescript`
  alias uses the TypeScript 6 compatibility API for ESLint; do not remove it
  without verifying support. See the [README](README.md).

Follow [Testing Conventions](.agents/docs/testing-conventions.md) for focused
commands, fixtures, isolation, and automated/manual validation limits.
Use [Release Process](.agents/docs/release-process.md) for packaged-app validation;
passing development tests alone does not establish release support.
