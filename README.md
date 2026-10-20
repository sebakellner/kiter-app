# Kiter

Kiter is a local-first desktop app for music producers to explore their sample
libraries, preview sounds, save favorites, and drag audio into a DAW.

Browse the folders you already use, listen to sounds in context, and bring the
right sample into your session without reorganizing your files first.

Your audio stays on your computer. Importing folders, previewing samples, and
marking favorites never move or modify the original files.

## What You Can Do Today

- **Explore folders:** discover audio inside a folder and its subfolders, with
  relative paths to distinguish files with the same name.
- **Preview sounds:** see waveforms and durations, then play, pause, seek, and
  adjust volume with a shared player.
- **Save favorites:** mark samples, filter the catalog, or browse all your favorites
  in the dedicated Favorites view. Your marks survive restarting Kiter.
- **Browse your library:** Samples lists audio from all folders you have added,
  with paginated results and an optional favorites filter.
- **Find samples in a list:** search Samples, Favorites, or a Collection by name,
  relative path, and saved Instrument/Genre names. Combine the query with
  Instrument, Genre, Sample type, and Favorite filters.
- **Build Collections:** create named selections with optional descriptions, add
  a Sample to multiple Collections, remove references, and arrange members in a
  saved manual order. Edit a Collection or delete it after reviewing the impact;
  deleting a Collection keeps its Samples, Favorites, and original audio.
- **Inspect samples:** select a row independently of playback and use **Info** to
  see its available catalog information.
- **Apply classification suggestions:** Sample Info suggests Instruments, Genres,
  and Sample type from cataloged paths and available Pack Genre evidence. Inspect
  the evidence, then apply one suggestion or all actionable suggestions for that
  Sample. Accepted classifications survive restarting Kiter.
- **Edit classifications:** manually assign or clear a Sample's Instruments and
  Genres, or set its type to Loop, One-Shot, or Unknown from Info.
- **Pick up where you left off:** during the current session, navigation restores
  your page, favorites filter, selection, inspector, and scroll position.
- **Drag into your DAW:** drag a sample's name or waveform to an application that
  accepts external audio files. Kiter supplies the original file, one per gesture.

Kiter discovers `.mp3`, `.wav`, `.flac`, `.ogg`, `.m4a`, and `.aac` files.
Playback and DAW compatibility depend on the audio format and the receiving app.
Waveforms load as you browse rather than analyzing the entire folder upfront.

## Getting Started

1. Open Kiter and click **Open folder**.
2. Choose a folder containing your samples.
3. Click a sample's name or **Play** to listen, or mark it as a **Favorite**.
4. Drag a sample's name or waveform into your DAW to use it.

Open more folders to add their samples to the same library. Use **Samples** to
browse the catalog or **Favorites** to see your saved picks across folders.

Use a Sample's **More actions** menu to add it to a Collection, or open
**Collections** to create and manage your selections. In a Collection, drag a
dedicated reorder handle or use the move actions to arrange Samples; dragging a
name or waveform still sends the original file to your DAW.

Kiter starts on Home after restarting; your catalog and favorites remain available,
along with Collections and saved classifications, while navigation context starts
fresh.

## Project Status

Kiter is in active development. The current app focuses on library browsing,
previewing, favorites, ordered Collections, list search and filters, single-Sample
classification editing and suggestions, and dragging samples into a DAW.

The project targets macOS and Windows. Development checks have been validated
locally on macOS; Windows, packaged releases, and actual DAW drops still need
validation.

### What's Next

The following features are planned and are not yet available in the app:

- **Packs:** keep imported sample packs recognizable with their own information.
- **Batch Collection workflows and covers:** organize multiple selected Samples
  at once and personalize Collections with artwork.
- **Classification management and Author credits:** manage the vocabulary beyond
  single-Sample assignments and record who created sounds.
- **Global search:** find multiple kinds of library items from one search entry,
  beyond the current Sample-list search.
- **Profile and settings:** personalize your local profile and preferences.
- **Reviewed organization and export:** rename, relocate, or gather samples into
  a chosen folder, with a chance to review changes before they happen.
- **Batch and import classification:** extend single-Sample suggestions to reviewed
  multi-Sample/Pack workflows and import, including remembered rejections.

### Current Limitations

- Global cross-entity search and general Sample/Pack metadata editing are not
  available yet. Sample-list search, single-Sample classifications, and Collection
  name/description editing are available.
- Collection membership actions currently operate on one Sample at a time.
  Manual ordering is available only without active list filters or search.
- Navigation context is session-only. Up to 100 history snapshots are retained;
  older entries fall back to the latest context for that destination.
- Files moved or renamed outside Kiter are not automatically reconnected.
- Startup protects supported catalog migrations with a backup. User-facing
  backup management and damaged-library recovery tools are not available yet.

## Run from Source

Use Node.js 22.18 or newer and pnpm:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

### Reset Development Data

`pnpm dev` keeps its database, managed images, preferences, and browser state in
the isolated `.kiter-dev/current/` profile inside the repository.

To start fresh, fully quit the development app, then run:

```bash
pnpm dev:reset
pnpm dev
```

The reset archives the entire profile in `.kiter-dev/archives/`. The next launch
creates a clean profile with the current migrations. Original audio files and
data from earlier default-profile runs remain untouched. Archives are retained
until you remove them, and `.kiter-dev/` is excluded from Git.

To recover an archive, quit the app, run `pnpm dev:reset` if a current profile
exists, then move the chosen archive directory to `.kiter-dev/current/` and
restart with `pnpm dev`.

For contributors, see the [development commands](AGENTS.md#development-and-validation),
[architecture](.agents/docs/architecture.md),
[data access](.agents/docs/data-access.md), and
[testing conventions](.agents/docs/testing-conventions.md).
