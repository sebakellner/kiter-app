# Kiter

Local-first desktop audio library built with Electron, React, and TypeScript.
macOS and Windows are the target platforms; current automated development
validation is on macOS, not packaged applications or Windows.

## Audio Library

- Click **Open folder** to discover `.mp3`, `.wav`, `.flac`, `.ogg`, `.m4a`,
  and `.aac` files recursively, with case-insensitive extension filtering and
  natural name ordering. Extensions do not verify audio contents.
- Rows show relative paths to distinguish duplicate names. Symbolic links are
  ignored, avoiding cycles and discovery outside the chosen directory.
- The list shows a total and scrolls for large folders. Waveforms and durations
  load as rows approach the visible area. Decoding is serialized; at most 256
  waveforms are cached, and decoded audio buffers are released.
- Click **Preview** to play a sample or **Stop** to stop it. One shared player
  provides pause, seeking, and volume. Starting another sample stops the
  previous one; opening a folder also stops preview.
- Drag a sample's name or waveform into a compatible DAW. Native dragging
  supplies the original file, not a temporary copy or internal URL. No audio
  is moved or modified. The target must accept external audio in that format.
  Dragging supports one sample per gesture, not multiple selection.
- Audio streams through an authorized local Electron protocol with opaque
  session URLs, rather than disk-path URLs.
- Unsupported, damaged, or unavailable audio displays a row error without
  blocking other samples. Very long files can still be expensive to decode;
  opening a folder does not eagerly decode its entire library.
- Canceling folder selection preserves the prior list. A failed read preserves
  the last successful folder and shows an error. Unreadable subfolders fail the
  import instead of silently returning an incomplete list.

## Persistent Catalog and Favorites

- Click **Favorite** on a sample to save its mark, or **Favorited** to remove it.
  **Favorites in this folder** filters the current listing. Writes show a pending
  state; failed writes display an error without claiming success.
- Fully quit Kiter, reopen it, and open the same folder to recover sample IDs and
  favorites. The selected folder is not automatically restored on startup.
- SQLite stores roots, samples, and their associations in `catalog.sqlite` under
  Electron's application `userData` directory. Database work runs in a dedicated
  worker, using built-in experimental `node:sqlite` with no additional dependency.
- The initial identity policy maps an exact canonical file location to a UUID.
  Rescans and overlapping roots reuse that ID and favorite. Missing files retain
  their records. Different copies at different paths are separate samples.
- External moves/renames are not reconciled: a new location gets a new ID.
  Replacing a file at the same location inherits that location's record; content
  and source-version matching are not implemented.
- Favorites are persisted across folders, but there is no global favorites view,
  named favorite list, kit model, relinking, or metadata editor yet.
- Importing and favoriting never modify source audio. Session audio URLs are
  regenerated, not stored as catalog references.

### Storage Failures and Backup

Schema v1 is created transactionally. Unsupported schemas, corrupt databases,
or inaccessible storage produce errors rather than resetting favorites or
silently falling back to in-memory storage. Correct permissions/free space or
restore a known compatible backup, then restart Kiter. Do not delete the catalog
as an automatic repair.

For a manual backup, fully quit Kiter before copying `catalog.sqlite` and any
SQLite companion files from its `userData` directory. There are no automatic
backups, migration/recovery UI, or upgrade migrations yet. These and packaged
worker/SQLite validation on both target platforms remain release work.

See [Data Access](.agents/docs/data-access.md) and
[Domain Model](.agents/docs/domain-model.md) for the implemented contracts and
accepted identity limitations.

## Setup and Development

Use Node.js 22.18 or newer:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Recommended editor extensions:
[ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
and [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode).

## Validation

```bash
pnpm test       # Node filesystem, audio, catalog durability and rollback tests
pnpm test:app   # Build + real Electron library and process-restart tests; needs a desktop
pnpm typecheck
pnpm lint
```

Electron integration exercises renderer/preload/main communication, real WAV
waveforms and playback, range streaming, sample switching, codec errors,
deferred loading, and authorized native drag payloads. `startDrag` is replaced
in the test: actual file reception by Ableton Live or another DAW remains a
manual check.

Favorites verification launches three separate Electron processes against one
isolated temporary catalog: save, reopen/remove, and reopen/verify removal.
It also covers duplicate clicks, pending/error feedback, canceled folder
selection during a write, filtering, ID/boolean validation, normal shutdown,
and preservation of original audio bytes. Unit tests cover missing/reappearing
locations, overlapping roots, failed transactions, and unsupported/corrupt
catalogs without resets.

## TypeScript

Type checks use **TypeScript 7.0.2** through the `@typescript/native` alias,
which supplies `tsc`. ESLint uses the TypeScript 6 compatibility API through the
`typescript` alias for `@typescript/typescript6`, because `typescript-eslint`
does not yet support the TypeScript 7 API. This follows Microsoft's
[side-by-side installation guidance](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0).

```bash
pnpm exec tsc --version
pnpm typecheck
```

Install the recommended
[TypeScript (Native Preview)](https://marketplace.visualstudio.com/items?itemName=TypeScriptTeam.native-preview)
extension to use TypeScript 7 in VS Code. Installing dependencies alone does
not change the editor's built-in TypeScript service.

## Build

```bash
pnpm build       # Type check and compile
pnpm build:win   # Package for Windows
pnpm build:mac   # Package for macOS
```

Build commands do not establish platform support. See
[Release Process](.agents/docs/release-process.md) for packaging validation.
Linux build tooling exists but Linux is outside the current product scope.
