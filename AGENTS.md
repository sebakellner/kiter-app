# Kiter

Kiter is a local-first sample-library desktop app built with Electron, React,
and TypeScript. It helps music producers discover, preview, organize, and use
audio in a DAW. It is not a web monorepo.

See the [README](README.md) for current behavior, implementation status,
limitations, and setup; [Domain Model](.agents/docs/domain-model.md) owns product
scope and entity semantics. Planned features are not implemented contracts.

## Documentation Index

Read [Common Guidelines](.agents/docs/common-guidelines.md) before changing
source code or tests. Read [Testing Conventions](.agents/docs/testing-conventions.md)
before changing tests, fixtures, mocks, or validation workflows.
Load other guides only when relevant to the task:

| Guide                                                            | Read when                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [Common Guidelines](.agents/docs/common-guidelines.md)           | Changing code or tests: reuse, types, contracts, state, errors, and privacy.         |
| [Component Organization](.agents/docs/component-organization.md) | Creating, splitting, sharing, or moving React components.                            |
| [Architecture](.agents/docs/architecture.md)                     | Changing process boundaries, services, filesystem workflows, or native integrations. |
| [Domain Model](.agents/docs/domain-model.md)                     | Changing entities, relationships, metadata, lifecycle, or domain validation.         |
| [Testing Conventions](.agents/docs/testing-conventions.md)       | Changing tests, fixtures, mocks, or validation commands.                             |
| [Feature Development](.agents/docs/feature-development.md)       | Adding or extending a feature end to end.                                            |
| [UX Design](.agents/docs/ux-design.md)                           | Changing shared shell, navigation, selection/history, focus, or list presentation.   |
| [UI Patterns](.agents/docs/ui-patterns.md)                       | Changing interactions, forms, dialogs, accessibility, or feedback.                   |
| [Data Access](.agents/docs/data-access.md)                       | Changing IPC, queries, mutations, persistence, or managed images.                    |
| [Release Process](.agents/docs/release-process.md)               | Packaging, validating, or distributing releases.                                     |

### Feature Contracts

Load the relevant feature guide instead of loading every workflow. General
guides own shared rules; feature guides own detailed behavior, feature-specific
architecture, status, and remaining executable contracts. Follow cross-links
only for dependencies involved in the task.

| Feature guide                                                         | Read when                                                                                                               |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [Classification](.agents/docs/features/classification.md)             | Changing recognition, aliases, initial vocabulary, evidence/rejections, type suggestions, or standalone classification. |
| [Import](.agents/docs/features/import.md)                             | Changing discovery/review, selected-file import, Pack registration/reimport, target commits, or result membership.      |
| [Operation Execution](.agents/docs/features/operation-execution.md)   | Changing the shared confirmed import/classification/relinking queue, cancellation, exit/restart, history cleanup, or recovery journals. |
| [Search](.agents/docs/features/search.md)                             | Changing global/local matching, filters, ranking, approximate queries, or result pagination.                            |
| [Duration Analysis](.agents/docs/features/duration-analysis.md)       | Changing persisted duration, background measurement, pause/resume, source invalidation, or retries.                     |
| [Playback](.agents/docs/features/playback.md)                         | Changing transport/modes, sequence snapshots, unavailable playback, last-Sample restoration, or removal interactions.   |
| [Catalog Organization](.agents/docs/features/catalog-organization.md) | Changing removal/reinclusion, Collection memberships/order, detail assignments, source relinking/registration lifecycle, or manual origin corrections. |

Keep rules in their owning guide rather than duplicating them here.
Add guides incrementally when requested; index only existing files.
Do not create speculative documentation scaffolding.

## Target Platforms

- Target macOS and Windows with equivalent core workflows; Linux is out of scope.
- Report tested platforms and remaining gaps. A build target or passing mock does
  not prove packaged-app support or actual DAW reception.
- Agree and validate minimum OS versions and CPU architectures before claiming
  release support.

## File and Data Integrity

- Import, analysis, preview, and Favorite changes must not modify source audio.
- Rename, move, centralize, and export only after explicit user action.
  Show sources, destinations, affected references, and conflicts before changes.
  Never silently overwrite or delete originals, or assume a conflict policy.
- Preserve Sample identities and organization when paths change. Report partial
  outcomes accurately; never label a partially failed batch as successful.
- Never automatically reset or delete local databases. Earlier development
  databases must remain untouched.
- Do not follow symbolic links without an explicit policy preventing cycles
  and access outside the selected scope.
- Authorize audio access and native dragging in main against library Samples;
  never trust arbitrary renderer-supplied paths.
- Keep observed metadata, user edits, and automatic suggestions distinct.

## Development and Validation

Use pnpm and keep [pnpm-lock.yaml](pnpm-lock.yaml) up to date.
[package.json](package.json) is the source of truth for scripts and dependencies.

```bash
pnpm install --frozen-lockfile
pnpm dev             # Electron development app
pnpm typecheck       # Main/preload and renderer types
pnpm lint            # ESLint
pnpm test            # node:test, not watch mode
pnpm test:ui         # React component/hook behavior
pnpm typecheck:tests # Node, renderer-test, and E2E types
pnpm test:app        # Build and Electron integration; requires a desktop
pnpm test:desktop    # One build for Electron integration and Playwright E2E
pnpm build           # Type checks and production build
pnpm db:generate     # Generate migrations; review SQL
pnpm db:check        # Validate migration metadata
```

Use focused validation from [Testing Conventions](.agents/docs/testing-conventions.md);
development checks alone do not establish release support.

## Repository-Wide Constraints

- Keep core audio and organization workflows local; remote services require
  an explicit need and approval.
- Write UI text, documentation, and code comments in English.
- Follow [Logging and Privacy](.agents/docs/common-guidelines.md#logging-and-privacy);
  diagnostics must not expose producer data.
