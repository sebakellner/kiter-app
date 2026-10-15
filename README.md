# Kiter

Kiter is a local-first desktop app for music producers to explore their sample
libraries, preview sounds, save favorites, and drag audio into a DAW.

Your audio stays on your computer. Importing folders, previewing samples, and
marking favorites never move or modify the original files.

## What You Can Do Today

- **Explore folders:** discover audio inside a folder and its subfolders, with
  relative paths to distinguish files with the same name.
- **Preview sounds:** see waveforms and durations, then play, pause, seek, and
  adjust volume with a shared player.
- **Save favorites:** mark samples and filter favorites in the current folder.
  Your marks are restored when you reopen that folder, including after restarting
  Kiter.
- **Drag into your DAW:** drag a sample's name or waveform to an application that
  accepts external audio files. Kiter supplies the original file, one per gesture.

Kiter discovers `.mp3`, `.wav`, `.flac`, `.ogg`, `.m4a`, and `.aac` files.
Playback and DAW compatibility depend on the audio format and the receiving app.
Waveforms load as you browse rather than analyzing the entire folder upfront.

## Getting Started

1. Open Kiter and click **Open folder**.
2. Choose a folder containing your samples.
3. Click **Preview** to listen, or mark a sample as a **Favorite**.
4. Drag a sample's name or waveform into your DAW to use it.

Kiter currently opens one folder view at a time. After restarting, choose the
folder again to see its samples and saved favorites.

## Project Status

Kiter is in active development, targeting macOS and Windows. Automated development
checks currently run on macOS; Windows, packaged releases, and real DAW drops
still need validation.

Planned features include Pack and Collection editors, Categories and Author
credits, global search, profile/settings, and reviewed file organization and
export workflows. Centralization will gather samples into a producer-selected
local folder organized by sample type. Automatic organization will propose
classifications and groupings for review before modifying files; tasks will
track analysis, organization, renaming, relocation, and export with visible
status and errors. These are not yet available in the app.

Internally, a fresh 17-table Drizzle/`better-sqlite3` catalog runs in a worker,
with committed migrations, stable Sample/source records, transactional local
profile/Preferences bootstrap, and validated IPC result envelopes for existing
import and Favorite workflows. Earlier development databases are not opened,
migrated, or deleted.

Author/Category operations support paginated search, independent Sample/Pack
assignments, use inspection, and impact-checked deletion. Collection operations
support creation/editing, bounded lists, unique ordered Sample memberships,
atomic full-sequence reorder, and impact-checked removal. These operations are
internal to the DB worker/client; their IPC and UI remain pending. Collection
removal preserves Samples and schedules unreferenced covers for cleanup, but
managed-image publication and physical cleanup are not yet implemented.
Internal profile editing supports normalized presentation names and explicit
Author linking/unlinking, preserving the avatar and Preferences without changing
Author names or assigning credits. Profile/settings UI and player volume
restoration remain pending.
Pack operations support reviewed registration/reimport from scanned roots,
bounded queries, presentation editing, manual Sample origin corrections, and
impact-checked removal through the DB worker/client. Conflicts require explicit
keep/assign decisions, including manually standalone Samples; stale reviews are
rejected. Preparing an import catalogs Samples before Pack confirmation. Removing
a Pack preserves its Samples with manual standalone protection. Pack IPC/UI and
managed covers remain pending.
Schema and internal operations alone do not deliver user-facing features.

Sample operations support presentation-name/notes editing, bounded reference
and exclusion queries, and exact-impact reviewed catalog removal. Removal keeps
original audio and excludes its canonical location across overlapping roots.
Explicit reinclusion verifies readable, non-symlink audio within a registered
root and creates a new manually standalone Sample without restoring deleted
organization. These operations are internal to the worker/client and library
service; Sample editing/removal/reinclusion IPC and UI remain pending.

External file moves and renames are not automatically reconciled. There is no
global favorites view, automatic backup, or library recovery UI yet.

## Run from Source

Use Node.js 22.18 or newer and pnpm:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

For contributors, see the [development commands](AGENTS.md#development-and-validation),
[architecture](.agents/docs/architecture.md),
[data access](.agents/docs/data-access.md), and
[testing conventions](.agents/docs/testing-conventions.md).
