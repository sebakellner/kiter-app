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

Kiter is in active development. The current app focuses on folder browsing,
previewing, favorites, and dragging samples into a DAW.

The project targets macOS and Windows. Development checks have been validated
locally on macOS; Windows, packaged releases, and actual DAW drops still need
validation.

### What's Next

The following features are planned and are not yet available in the app:

- **Packs and Collections:** keep imported sample packs recognizable and build
  your own ordered selections without duplicating audio.
- **Categories and Author credits:** classify sounds and record who created them.
- **Library-wide search:** find samples across your imported folders.
- **Profile and settings:** personalize your local profile and preferences.
- **Reviewed organization and export:** rename, relocate, or gather samples into
  a chosen folder, with a chance to review changes before they happen.
- **Organization suggestions:** review proposed classifications and groupings
  while keeping control over your library.

### Current Limitations

- Browsing and favorite filtering are limited to the selected folder; there is
  no library-wide favorites view yet.
- The selected folder is not restored when you restart Kiter.
- Files moved or renamed outside Kiter are not automatically reconnected.
- Automatic backups and library recovery tools are not available yet.

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
