# Testing Conventions

Read this guide before adding or changing tests, fixtures, mocks, or validation
commands. See [Common Guidelines](common-guidelines.md) for coding rules,
[Architecture](architecture.md) for process boundaries, and
[Domain Model](domain-model.md) for domain invariants.
See [Component Organization](component-organization.md) for component ownership
and coverage of private pieces without changing the current test layout.

## Current Tooling

- Unit and filesystem tests use `node:test` and `node:assert/strict`.
- TypeScript test files run through Node's type stripping, not a separate
  test compiler. Use Node.js 22.18 or newer, as documented in the
  [README](../../README.md).
- Electron integration uses an executable script against the built app,
  exercising the renderer, preload, main handlers, and local audio protocol.
- There is no configured Vitest, Jest, React Testing Library, or Playwright
  suite. Do not assume their APIs or add a runner for an unrelated change.
- Plain Node tests do not type-check TypeScript. Run the applicable type checks
  separately; current application tsconfigs do not include the test directory.

## Organization and Commands

Keep tests in [tests](../../tests) using descriptive `*.test.ts` or `*.test.mjs`
names. Keep reusable fixtures alongside them, outside production code.
Electron scripts use distinct names so the Node test glob does not run them.

Run commands from the repository root:

```bash
# One unit test file
pnpm exec node --experimental-strip-types --test tests/library.test.ts

# Related files in one invocation
pnpm exec node --experimental-strip-types --test tests/audioRange.test.ts tests/waveform.test.mjs

# A named test; runner options must precede file paths
pnpm exec node --experimental-strip-types --test --test-name-pattern="duplicate names" tests/library.test.ts

# All unit/filesystem tests
pnpm test

# Application type checks and lint
pnpm typecheck
pnpm lint

# Build and Electron integration; requires a desktop session
pnpm test:app
```

Use the smallest selection covering the change first. Escalate to the full
unit suite or Electron integration when shared behavior or process boundaries
are affected. Do not repeat builds unnecessarily.

Use explicit file paths for focused commands rather than relying on shell glob
expansion. Consult [package.json](../../package.json) for authoritative scripts.
Documentation-only changes need no application tests unless a documentation
validation tool is introduced.

## Test Design

- Write test titles in English and describe observable expected behavior.
  Use suite titles to identify the feature or scenario when grouping helps.
  A `should` prefix is optional. Keep setup, action, and assertions clear.
- Assert exact output shapes, identities, ordering, units, and state transitions
  where they are part of the contract. Use tolerances for floating-point results.
- Cover meaningful boundaries and failure paths, not every internal helper
  implementation detail. A mock call alone is not proof that a workflow works.
- Include cancellation, stale results, repeated actions, and cleanup when
  testing asynchronous resources.
- Do not weaken assertions or skip a regression just to make the suite pass.
  If behavior intentionally changes, update expectations and related docs.
- Assert stable error codes or domain categories where available, rather than
  complete OS-specific error strings or stack traces.

## UI Queries and Text Assertions

- Prefer semantic roles and meaningful accessible names when the test tooling
  supports them. Scope queries to the relevant dialog, group, or sample row.
- In the current Electron DOM scripts, identify elements by stable semantic
  attributes or explicit test identifiers. Native `querySelector` does not
  resolve computed roles or accessible names like an accessibility-aware tool.
- Avoid CSS styling classes and DOM positions as the primary way to identify
  a control. Locate a sample row by its fixture identity, then query within it.
  Assert row ordering separately when ordering is the behavior under test.
- If semantic queries cannot reliably identify an element, use a stable
  `data-testid` in English, independent of display copy. Add identifiers only
  where needed, not to every element.
- Preserve user-facing accessible labels. Never replace them with technical
  identifiers merely to simplify selectors.
- Kiter's first release is English-only, but behavioral tests should not depend
  on incidental label wording. Reuse owning text constants when they exist;
  do not duplicate long messages or add a localization framework just for tests.
- A query using a hardcoded accessible name is still copy-dependent. Keep such
  expectations intentional and update them when the accessible contract changes.
- Use explicit text assertions when copy, validation feedback, or accessible
  wording is itself the behavior under test. Verify important error feedback,
  not merely the presence of an arbitrary alert.
- Await interactions and observable asynchronous updates. Do not introduce
  fixed delays solely to wait for rendering.
- If component-testing tooling is adopted later, reuse its configured setup,
  actual required providers, and interaction helpers. These rules do not imply
  Testing Library, `userEvent`, or a provider wrapper already exists.

## Shared Fixtures and Mock Factories

- Reuse existing fixture helpers before creating alternatives. Keep reusable
  domain data and factories under the current test directory; do not create a
  separate mock hierarchy until actual reuse justifies it.
- Use typed factories for domain data as production contracts become available.
  Each call must return fresh mutable objects, including nested arrays and
  records, so tests cannot leak changes through shared references.
- Make defaults deterministic and allow explicit overrides for the scenario.
  Avoid random IDs, timestamps, or unrelated invalid values that obscure intent.
- Share data and factories, but keep dependency replacement and mock registration
  visible in the owning test. Helpers must not hide global patches or lifecycle
  requirements.
- Reuse real domain types without casts that bypass required fields. Add kit,
  favorite, or task factories only when those executable contracts exist.
- Keep mocks focused on the boundary being isolated. Do not mock away the
  behavior the test claims to validate or introduce Vitest-specific APIs into
  the existing Node runner.

## Fixtures and Isolation

- Create unique temporary directories with `mkdtemp` under `os.tmpdir()`.
  Never use a producer's actual samples or modify repository fixtures in place.
- Clean up in `finally` or test cleanup hooks, including when assertions fail.
  Restore permissions before removing protected directories.
- Delete only the fixture directory created by that test. Never recursively
  delete broad paths or use name-based process termination.
- Use `path` utilities for locations and expected paths. Account for canonical
  paths when symlinked system temp directories differ from their displayed path.
- Generate deterministic audio with the existing [WAV fixture](../../tests/wav.mjs).
  Do not download samples or include private/licensed producer libraries.
- Restore patched globals and subscriptions. Prefer `t.mock` for Node mocks;
  explicitly restore manually modified property descriptors.
- Module caches and queues may survive between tests in one process. Use distinct
  keys, controlled cleanup, or existing isolation mechanisms; do not add
  production reset APIs solely for tests.
- Tests changing global state must not run concurrently in the same process.
  Run mutating integration fixtures independently unless isolation is proven.
- Set Electron `userData` to a temporary test directory before importing the
  application entrypoint; never write a test catalog into real user data.
- Close database handles and wait for the worker before deleting fixtures.
  Start shutdown with `app.quit()` to cover the application's cleanup.
  If the test needs an explicit exit status, call `app.exit(code)` only from
  `will-quit`, after worker shutdown. `process.exitCode` alone is not sufficient
  for Electron's normal quit path.
- Test restart durability with separate Electron processes sharing only the
  isolated fixture. Renderer reload alone does not prove persistence.
  [Favorites restart verification](../../tests/favorites-restart.mjs) runs
  save, remove, and verify phases as part of `pnpm test:app`.

## Filesystem and Domain Coverage

Follow [library tests](../../tests/library.test.ts) for temporary directory
setup and recursive discovery cases.

- Cover supported extensions, mixed casing, nested/empty folders, non-audio
  files, duplicate names, ordering, missing files, permissions, and symlink
  behavior when affected.
- Empty audio files are acceptable for extension-based discovery tests, but
  cannot validate metadata extraction, decoding, or playback.
- For planned rename, relocation, centralization, and export, verify source
  preservation, destination content, stable IDs, and reference consistency.
- Once persistent operations exist, cover collisions, stale plans, cancellation,
  partial failure, restart reconciliation, and cross-volume behavior.
  Those are future coverage requirements, not current test capabilities.
- Use real temporary storage for persistence integration when introduced.
  Mocked repository calls do not prove transactions or migrations work.

## Audio and Resource Coverage

- Test peak extraction with silence, positive/negative amplitudes, multiple
  channels, short buffers, final samples, and invalid input.
- Test queue concurrency, cache reuse/eviction, cancellation before and during
  decoding, failure recovery, and decoder cleanup.
- Use controlled decoders for unit-level lifecycle tests, following
  [waveform tests](../../tests/waveform.test.mjs). Validate real decoding
  separately in Electron with known WAV duration and waveform content.
- For preview integration, verify time advances, stop resets playback, switching
  keeps one active player, rapid actions settle on the intended sample, and
  unmounting releases the media source.
- Mute generated integration audio to avoid unintended sound. A passing playback
  test verifies media behavior, not subjective sound quality.
- Assert HTTP range status, byte counts, and invalid ranges for streaming.
  Test unauthorized and revoked sample identifiers across privileged workflows.
- For lazy loading, measure actual fetch/decode activity relative to visible rows.
  A small fixture is a behavior check, not proof of large-library scalability.

## Electron Integration

Use [library.electron.mjs](../../tests/library.electron.mjs) as current prior art.

- Build before testing unless deliberately rerunning an unchanged built app.
  Do not present a test of stale output as validation of new source changes.
- Initialize the application without blocking Electron startup behind top-level
  awaits. Run asynchronous fixture setup through the script's test workflow.
- Replace folder selection to control fixtures, but exercise the actual preload
  bridge, handlers, protocol, and UI.
- Wait for observable conditions with a deadline and useful failure labels.
  Avoid fixed sleeps as readiness checks and avoid polling without a timeout.
- Organize long workflows into named sequential scenarios with explicit initial
  state. Report the failed scenario and stop rather than continuing with invalid
  shared state. Reuse the process, not implicit state left by an earlier scenario.
- Use controlled gates for pending operations and delivery barriers for
  unsubscription checks. A fixed sleep does not prove an event was processed.
- Fail on unexpected renderer console errors, uncaught exceptions, and unhandled
  rejections. Keep intentionally triggered failures distinct from these errors.
- Scenario timings are diagnostic information, not performance benchmarks or
  evidence of large-library scalability.
- Return serializable results from `executeJavaScript`; DOM nodes, functions,
  and media objects cannot be returned across Electron's result bridge.
- Treat renderer errors and failed assertions as failures. Exit nonzero and
  release temporary files and app resources on both success and failure.
- `webContents.startDrag` is currently replaced to inspect real-file payloads
  and icons. This does not perform a system drag or verify DAW reception.

## Platform and Manual Validation

macOS and Windows are the target platforms. Report which OS was tested.
Use explicit, reasoned skips for platform prerequisites, such as POSIX
permission tests or Windows symlink privileges; a skip is not a pass.

When native integration changes, manually verify on each target OS:

1. Open a folder and preview a valid sample.
2. Drag from its name and waveform to a supported DAW import target.
3. Confirm the destination receives the expected original audio file.
4. Check missing files, denied access, and behavior after changing the library.
5. Verify preview controls still work and the source remains unchanged.

Release validation must also cover the packaged application, not only development
mode. Codec availability, permissions, native dependencies, and DAW acceptance
can vary by OS and packaging.

## Reporting Results

State commands run, their outcomes, skipped cases, and manual validation gaps.
Distinguish unit, integration, packaged-app, and manual evidence.
Do not claim support for every codec, DAW, OS version, or library size based on
one successful fixture or platform run.
