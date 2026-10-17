# Release Process

Read this guide when packaging or distributing Kiter.
Target platforms are macOS and Windows; see [AGENTS.md](../../AGENTS.md#target-platforms).
Use [Testing Conventions](testing-conventions.md) for validation details.
The first beta's agreed required workflows and macOS/Windows exit gates are owned
by [Beta Scope](beta-scope.md). That plan is not a claim of release readiness.

## Current Status

[Package scripts](../../package.json) and
[builder configuration](../../electron-builder.yml) provide packaging commands.
Product identifiers and publishing settings still include template values,
and macOS notarization is disabled. They are not a production release setup.
Signing, update delivery, minimum OS versions, and CPU support remain to be agreed.

## Basic Checklist

1. Confirm version, release scope, supported platforms/architectures, and known
   limitations. Replace template product and publishing configuration before
   distribution; do not publish to placeholder endpoints.
2. Install with `pnpm install --frozen-lockfile`, then run `pnpm typecheck`,
   `pnpm typecheck:tests`, `pnpm lint`, `pnpm test`, `pnpm test:ui`, and
   `pnpm test:desktop` in suitable environments.
3. Package with `pnpm build:mac` or `pnpm build:win` on the appropriate platform.
   Run type checks explicitly: the current macOS packaging script omits them.
4. Validate the packaged app: launch, folder access, waveform/preview, native
   dragging into a DAW, and offline operation. Test catalog upgrades/recovery
   when persistence exists.
5. Configure and verify signing/notarization as required by the chosen
   distribution channel. Keep certificates and credentials outside source control.
6. Publish only approved artifacts with release notes and tested-platform
   information. Do not claim untested compatibility or automatic updates.

A development build or mocked drag test is not release validation.
Installer, signing, update, and rollback procedures will be expanded when the
distribution approach is selected.

## Local Packaged Recovery Smoke

Build an unsigned local macOS `.app`, then run the isolated recovery smoke:

```bash
pnpm rebuild:electron
pnpm build
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm exec electron-builder --mac --dir --publish never
pnpm test:packaged:mac
# Optional explicit bundle path (for example another CPU target)
pnpm test:packaged:mac "/absolute/path/to/my-app.app"
```

The runner preserves macOS framework symlinks while copying the bundle to a
temporary directory. It extracts/repackages ASAR only in that disposable copy,
adding a test-only bootstrap for isolated userData, native-dialog answers and
worker inspection, plus synthetic migrations. Production entrypoints, worker,
renderer and native binaries are reused; the original bundle is untouched.
This checks packaged runtime boundaries, not an unmodified signed artifact.

Verified locally on macOS Darwin 25.6.0 arm64 with Electron 39.8.10:

- ASAR startup and packaged SQLite/sharp loading; folder import, Favorite write,
  real WAV waveform decoding and muted playback.
- Pre-upgrade backup publication and catalog checksum verification.
- Blocked backup destination, alternate destination selection, migration failure,
  reviewed restoration and protective pre-restoration copy.
- Restored Sample identity/Favorite across separate processes, and byte-identical
  original generated audio. Temporary fixture storage is removed after shutdown.

The Electron library integration previously timed out while its renderer was
occluded (`visibilityState=hidden`, no focus). The test harness now disables
background throttling for its window and records bounded media diagnostics on
failure. Real playback and lazy-waveform assertions and timeouts are retained.
The complete integration/Favorites restart suite passed after that adjustment.

Remaining platform qualification:

- **Windows:** run Node backup/worker tests and Electron integration in Windows;
  adapt the packaged runner to `.exe`/`resources` paths and verify alternate-drive
  destinations, locked files, non-overwrite image publication, catalog replacement,
  interruption/restart and original preservation. Record Windows version/CPU.
- **Distributed artifacts:** validate an unmodified signed/notarized artifact,
  installation/launch from the chosen distribution format and actual DAW drops.
  This local unsigned, instrumented `.app` smoke does not establish those claims.
