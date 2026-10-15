import { access, lstat, readdir, realpath, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import type { AudioFile, LibrarySample } from '../../../shared/ipc'
import type { DbClient } from '../../db'
import type { DiscoveredAudioFile } from '../../../shared/domain/source'
import { IpcError } from '../../../shared/ipc/result.ts'
import type { PackImportReview } from '../../../shared/domain/pack'
import type {
  Sample,
  SourceReinclusionRequest,
} from '../../../shared/domain/sample'
import { DomainValidationError } from '../../../shared/domain/validation.ts'

export async function reincludeLibrarySource(
  input: SourceReinclusionRequest,
  database: Pick<DbClient, 'getReinclusionRoot' | 'reincludeSource'>,
): Promise<Sample> {
  const root = await database.getReinclusionRoot(input)
  const location = path.relative(root.canonicalPath, input.canonicalPath)
  if (
    !location ||
    location === '..' ||
    location.startsWith(`..${path.sep}`) ||
    path.isAbsolute(location)
  ) {
    throw new DomainValidationError(
      'The source is outside the registered directory.',
    )
  }
  let file: DiscoveredAudioFile
  try {
    // Inspect every component so neither a symlinked file nor directory is followed.
    let current = root.canonicalPath
    const components = [
      current,
      ...location.split(path.sep).map((part) => {
        current = path.join(current, part)
        return current
      }),
    ]
    for (const component of components) {
      if ((await lstat(component)).isSymbolicLink()) {
        throw new Error('Symbolic links are not allowed')
      }
    }
    if (
      (await realpath(root.canonicalPath)) !== root.canonicalPath ||
      (await realpath(input.canonicalPath)) !== input.canonicalPath
    ) {
      throw new Error('The source location changed')
    }
    const observation = await stat(input.canonicalPath)
    if (
      !observation.isFile() ||
      !AUDIO_EXT.has(path.extname(input.canonicalPath).toLowerCase())
    ) {
      throw new Error('The source is not a supported audio file')
    }
    await access(input.canonicalPath, constants.R_OK)
    file = {
      name: path.basename(input.canonicalPath),
      path: input.canonicalPath,
      relativePath: location,
      observedSizeBytes: observation.size,
      observedMtimeMs: observation.mtimeMs,
    }
  } catch {
    throw new IpcError(
      'FOLDER_FAILED',
      'Unable to reinclude the source. Check that the original audio file is readable within the registered directory and is not a symbolic link.',
    )
  }
  return database.reincludeSource(input, file)
}

const AUDIO_EXT = new Set(['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac'])

export async function importLibraryFolder(
  directory: string,
  database: Pick<DbClient, 'importFolder'>,
): Promise<LibrarySample[]> {
  const { root, files } = await discoverFolder(directory)
  return database.importFolder(root, files)
}

export async function prepareLibraryPackImport(
  directory: string,
  database: Pick<
    DbClient,
    'importFolder' | 'getPackSourceRoot' | 'reviewPackImport'
  >,
): Promise<PackImportReview> {
  const { root, files } = await discoverFolder(directory)
  await database.importFolder(root, files)
  const { id } = await database.getPackSourceRoot(root)
  return database.reviewPackImport(id)
}

async function discoverFolder(
  directory: string,
): Promise<{ root: string; files: DiscoveredAudioFile[] }> {
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
  return { root, files: canonicalFiles }
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
