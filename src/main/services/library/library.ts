import { access, readdir, realpath, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import type { AudioFile, LibrarySample } from '../../../shared/ipc'
import type { DbClient } from '../../db'
import type { DiscoveredAudioFile } from '../../../shared/domain/source'
import { IpcError } from '../../../shared/ipc/result.ts'

const AUDIO_EXT = new Set(['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac'])

export async function importLibraryFolder(
  directory: string,
  database: Pick<DbClient, 'importFolder'>,
): Promise<LibrarySample[]> {
  let root: string
  const canonicalFiles: DiscoveredAudioFile[] = []
  try {
    root = await realpath(directory)
    const files = await readAudioDir(root)
    for (const file of files) {
      const canonicalPath = await realpath(file.path)
      const relative = path.relative(root, canonicalPath)
      if (
        !relative ||
        relative === '..' ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
      ) {
        throw new Error('Source is outside the selected directory')
      }
      const observation = await stat(canonicalPath)
      if (!observation.isFile()) {
        throw new Error('Source is not a regular file')
      }
      await access(canonicalPath, constants.R_OK)
      canonicalFiles.push({
        ...file,
        path: canonicalPath,
        observedSizeBytes: observation.size,
        observedMtimeMs: observation.mtimeMs,
      })
    }
  } catch (error) {
    const code =
      error instanceof Error &&
      'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : 'FOLDER_READ_FAILED'
    console.error('Library import failed:', code)
    throw new IpcError(
      'FOLDER_FAILED',
      `Unable to load the folder (${code}). Check folder access and database storage.`,
    )
  }
  return database.importFolder(root, canonicalFiles)
}

export async function readAudioDir(dirPath: string): Promise<AudioFile[]> {
  const files: AudioFile[] = []

  async function collect(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await collect(entryPath)
      } else if (
        entry.isFile() &&
        AUDIO_EXT.has(path.extname(entry.name).toLowerCase())
      ) {
        files.push({
          name: entry.name,
          path: entryPath,
          relativePath: path.relative(dirPath, entryPath),
        })
      }
    }
  }

  await collect(dirPath)
  return files.sort(
    (a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }) ||
      a.relativePath.localeCompare(b.relativePath, undefined, {
        numeric: true,
      }),
  )
}
