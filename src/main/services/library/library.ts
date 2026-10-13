import { readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import type { AudioFile, CatalogSample } from '../../../shared/ipc'
import type { Catalog } from '../catalog'

const AUDIO_EXT = new Set(['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac'])

export async function importLibraryFolder(
  directory: string,
  catalog: Pick<Catalog, 'importFolder'>
): Promise<CatalogSample[]> {
  let root: string
  const canonicalFiles: AudioFile[] = []
  try {
    root = await realpath(directory)
    const files = await readAudioDir(root)
    for (const file of files) {
      canonicalFiles.push({ ...file, path: await realpath(file.path) })
    }
  } catch (error) {
    const code =
      error instanceof Error && 'code' in error && typeof error.code === 'string'
        ? error.code
        : 'CATALOG_READ_FAILED'
    console.error('Library import failed:', code)
    throw new Error(`Unable to load the folder (${code}). Check folder access and catalog storage.`)
  }
  return catalog.importFolder(root, canonicalFiles)
}

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
