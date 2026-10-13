import { readdir } from 'node:fs/promises'
import path from 'node:path'
import type { AudioFile } from '../../../shared/ipc'

const AUDIO_EXT = new Set(['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac'])

export async function readAudioDir(dirPath: string): Promise<AudioFile[]> {
  const files: AudioFile[] = []

  async function collect(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await collect(entryPath)
      } else if (entry.isFile() && AUDIO_EXT.has(path.extname(entry.name).toLowerCase())) {
        files.push({
          name: entry.name,
          path: entryPath,
          relativePath: path.relative(dirPath, entryPath)
        })
      }
    }
  }

  await collect(dirPath)
  return files.sort(
    (a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }) ||
      a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true })
  )
}
