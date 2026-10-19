# Component Organization

Read this guide when creating, splitting, sharing, or moving React components
in Kiter. It does not require migrating existing components all at once.
See [Common Guidelines](common-guidelines.md) for coding rules,
[Architecture](architecture.md) for process boundaries, and
[Testing Conventions](testing-conventions.md) for test placement and commands.

## Ownership

| Location                                          | Responsibility                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/renderer/src/routes/`                        | Router configuration, route tree, and redirects.                                      |
| `src/renderer/src/stores/`                        | Application-wide renderer stores, independent of routing and UI components.           |
| `src/renderer/src/views/<View>/`                  | Route-level views, each in its own PascalCase folder with a matching component file.  |
| `src/renderer/src/layouts/<Layout>/`              | Application-level route composition, navigation, and connections to feature state.    |
| `src/renderer/src/features/<feature>/`            | Feature-specific UI, hooks, presentation types, and helpers.                          |
| `src/renderer/src/features/<feature>/components/` | Optional grouping when a feature has enough components to benefit from it.            |
| `src/renderer/src/components/`                    | Reusable application compositions independent of feature services and business rules. |
| `src/renderer/src/components/ui/`                 | Reusable UI primitives such as buttons, labels, text, inputs, and basic controls.     |
| `src/renderer/src/components/layouts/`            | Layout and navigation compositions, when needed.                                      |
| `src/shared/`                                     | Cross-process contracts, not React components.                                        |
| `src/main/`                                       | Privileged services and native operations, not UI behavior.                           |

These are ownership conventions, not directories to scaffold in advance.

- Cross-feature use does not automatically make a domain component generic.
  Share domain UI through its owning feature when that dependency is appropriate.
- Generic components receive data and callbacks instead of importing feature
  services or calling `window.api` directly.
- UI primitives belong in `components/ui/` and own presentation, variants, and
  native element behavior, not sample, kit, or task workflows. Preserve semantic
  HTML, accessibility, and appropriate native props and refs.
- Feature-specific controls may compose these primitives but stay in their
  feature. For example, a generic `Button` belongs in `ui/`, while
  `OpenFolderButton` belongs in the library feature.
- Create primitives when they provide reusable styling or behavior; do not wrap
  every HTML element or scaffold an entire design system in advance.
- Select and Combobox are primary controls owned by `components/ui/`, even during
  prototyping. Feature code supplies options, labels, values and callbacks; the
  controls own native semantics, focus, keyboard interaction and structural CSS.
  Use Select for fixed choices and Combobox for searchable choices. Keep domain
  queries, pagination, Zod schemas and React Hook Form workflows in the feature.
  Their module documentation owns component-specific contracts.
- Feature-level hooks or controllers coordinate bridge operations. Presentation
  components should not duplicate IPC, filesystem, or task-management logic.
- Define renderer form schemas in `features/<feature>/schemas.ts`, separate from
  components and hooks, and export their inferred form types there. When rules
  also validate IPC or worker inputs, keep the authoritative Zod schemas in
  `src/shared/features/<feature>/schemas.ts`; renderer schemas compose or select
  from them rather than duplicating validation. Shared schemas must remain
  independent of React, Electron, and persistence infrastructure. Create schema
  files only for features with actual validation needs.
- Keep application composition in `App` and explicit layout components.
  Do not introduce a shared UI package solely to reorganize one desktop app.
- App-level layouts compose feature APIs and generic presentation layouts.
  Feature state providers remain with their owning feature, independent of the
  router. View-specific session state stays with its view, even when its provider
  is mounted above routes to preserve it during navigation.

## Renderer Stores

- Put application-wide stores in `src/renderer/src/stores/` and feature-owned
  stores in `features/<feature>/stores/`. View-private state stays with its view
  until it needs a shared owner; do not create empty store directories.
- Name Zustand store modules `use<Name>Store.ts`. Keep state, actions, and their
  types together in a single file initially; introduce a module folder only when
  substantial private pieces justify it.
- Keep stores independent of React Router, UI components, and privileged APIs.
  Routing adapters belong in `routes/` or the owning layout; feature workflow
  hooks coordinate bridge access. Subscribe through focused selectors.
- Define each store's lifecycle and bounds explicitly. Persistence is opt-in
  under the owning feature contract, not an automatic store convention.

## Views and the Kiter UI Kit

- Route destinations live in `views/<View>/<View>.tsx`. Views compose feature
  components and hooks; reusable domain workflows stay in their owning feature.
- Keep view-private pieces beside the view until reuse justifies extraction.
  Create folders only for views being delivered, not for the full route roadmap.
- `components/ui/` is the incremental home of Kiter's proprietary UI kit. Add
  primitives for actual shared needs; visual variants, tokens, and a complete
  design-system API will be defined in a future design delivery.
- During UI prototyping, keep new CSS minimal and structural: shell regions,
  scrolling, necessary spacing, readable content, and accessible focus. Reuse
  existing primitives and native controls. Defer decorative styling, new visual
  variants, and speculative tokens to the UI-kit design work.
- Keep structural styles colocated with their owner so the future kit can replace
  presentation without moving domain behavior or rewriting route composition.

## Granularity and Module Folders

- Give each public component a clear responsibility. Split by behavior and
  ownership, not arbitrary JSX fragments or line-count thresholds.
- A small component may remain a single file. Use a dedicated module folder
  when it owns private components, hooks, styles, or substantial helpers.
- Keep private pieces within the module. Extract them to a shared owner only
  when actual reuse and dependency direction justify it.
- Do not create empty types, constants, helpers, skeletons, or entrypoint files
  to satisfy an example layout.
- Keep substantial asynchronous workflows in hooks or appropriate services,
  while leaving simple event wiring near the component.
- Separate pure audio calculations from rendering. A waveform canvas should
  not also own library scanning, catalog persistence, or native file validation.

Optional layout for a component that grows beyond one file:

```text
features/library/components/SampleRow/
  SampleRow.tsx
  SampleRow.types.ts
  SampleRow.constants.ts
  useSampleDrag.ts
```

This example is not an implemented module or a requirement to create every file.
A shared preview controller should remain above individual rows so splitting
the list cannot accidentally create one audio player per sample.

## Naming and Imports

- Use PascalCase component names and component files, following existing
  `FileList.tsx`, `OpenFolderButton.tsx`, and `Waveform.tsx` conventions.
- Use PascalCase module folders when a component needs one. Use descriptive
  names for supporting files and the `use` prefix for hooks.
- Preserve existing unrelated names when adding a feature. Do not perform a
  repository-wide naming migration as part of component work.
- Match import casing exactly and avoid basenames differing only in casing,
  even across extensions. This matters on both macOS and Windows.
- Use `import type` for type-only dependencies. Reuse shared sample contracts;
  component props should describe presentation needs without copying domain types.

## Public APIs

- Keep exports small and intentional. Preserve existing named/default exports
  when reorganizing a component unless its consumers are deliberately migrated.
- Direct file imports are valid for single-file components. Add a module
  `index.ts` with explicit exports only when it provides a useful stable boundary.
- When a module has an entrypoint, external consumers use it; internal files
  use direct relative imports rather than importing their own barrel.
- Do not export private subcomponents for convenience or create broad barrels
  that obscure ownership. Resolve cycles by fixing dependencies.
- Internal tests may exercise implementation helpers when appropriate;
  integration tests should verify consumer-visible behavior.

## Styles

- Keep component-specific CSS beside its implementation and import it from
  the component, not a central stylesheet. Consumers receive the styles through
  the component's public API.
- Keep global CSS focused on resets, fonts, shared tokens, and application
  foundations. Feature layout and domain-specific styles belong to their feature.
- Use ordinary CSS with descriptive, prefixed component classes under the
  current setup. Do not introduce a styling framework solely for organization.
- Reorganize existing styles incrementally. Preserve cascade order,
  specificity, focus, disabled states, and consumer layout when moving rules.

## State, Resources, and Accessibility

- Keep state at the lowest level that owns the behavior, lifting it when
  multiple components must coordinate. Props and callbacks are the default;
  add context only when its scope and consumers justify it.
- Assign one owner to each observer, subscription, pending request, and media
  resource. Splitting components must preserve cancellation and cleanup.
- Preserve stable keys, lazy waveform loading, bounded processing, and the
  single shared preview player. Do not create new caches or decoders on every render.
- Do not use memoization to mask unclear state ownership. Add it where stable
  inputs and measured or evident render cost make it useful.
- Preserve semantic controls, accessible names, focus behavior, and visible
  loading/empty/error states when extracting UI.
- Avoid nested interactive controls and accidental drag initiation from preview
  controls. Keep native dragging delegated through the typed bridge.
- Follow the English-first text policy in [Common Guidelines](common-guidelines.md).
  Reuse existing CSS and theme tokens rather than introducing parallel primitives.

## Tests

- Follow [Testing Conventions](testing-conventions.md): colocate component and
  hook tests as `*.test.tsx`, using the configured Vitest/Testing Library setup.
  Pure helpers use colocated Node `*.test.ts` or `*.test.mjs` tests. Cross-process
  Electron integration and Playwright E2E remain under `tests/`.
- Cover private subcomponents through their parent when that proves the
  behavior. Add isolated coverage only when independent logic or states warrant it.
- Verify observable interactions, loading/empty/error states, resource cleanup,
  and relevant accessibility behavior, not just component existence.
- Reuse `tests/support/` fixtures and helpers. Add provider wrappers only for
  actual application dependencies; keep bridge replacement explicit in tests.

## Incremental Reorganization

1. Identify consumers, tests, resource owners, and current exports before moving.
2. Preserve props and behavior; make intended behavioral changes explicit.
3. Update imports, exports, mocks, configuration, and documentation where affected.
4. Run focused tests and relevant type/lint checks; build when bundling or
   entrypoints change. Validate consumers, not only the extracted component.
5. Report the validation performed and any native/platform checks still needed.

Keep unrelated behavior changes separate. Documentation-only changes do not
require application tests unless a documentation-specific check exists.
