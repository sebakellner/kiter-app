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
export workflows. These are not yet available in the app.

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
