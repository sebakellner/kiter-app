# Release Process

Read this guide when packaging or distributing Kiter.
Target platforms are macOS and Windows; see [AGENTS.md](../../AGENTS.md#target-platforms).
Use [Testing Conventions](testing-conventions.md) for validation details.

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
