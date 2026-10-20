import { access, lstat, opendir, realpath } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import type { DiscoveredAudioFile } from '../../../shared/domain/source.ts'
import { AUDIO_FILE_EXTENSIONS } from '../../../shared/domain/source.ts'
import { PREPARATION_LIMITS, type PreparationIssue } from './types.ts'

export async function canonicalRoot(directory: string): Promise<string> {
  if (!path.isAbsolute(directory)) {
    throw new Error('Unsafe root')
  }
  // Reject symlink components even in a selected root, not only its children.
  let current = path.parse(directory).root
  for (const part of path
    .relative(current, directory)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, part)
    const info = await lstat(current)
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new Error('Unsafe root')
    }
  }
  const canonical = await realpath(directory)
  await access(canonical, constants.R_OK)
  return canonical
}

async function verifyLocation(root: string, location: string): Promise<void> {
  const relative = path.relative(root, location)
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error('Unsafe location')
  }
  let current = root
  const components = [
    root,
    ...relative
      .split(path.sep)
      .filter(Boolean)
      .map((part) => {
        current = path.join(current, part)
        return current
      }),
  ]
  for (const component of components) {
    if ((await lstat(component)).isSymbolicLink()) {
      throw new Error('Unsafe location')
    }
  }
  if ((await realpath(location)) !== location) {
    throw new Error('Unsafe location')
  }
}

type DiscoveryEvent =
  | { kind: 'file'; file: DiscoveredAudioFile }
  | { kind: 'issue'; issue: PreparationIssue }
  | { kind: 'symlink' }

export async function* discoverImportRoot(
  root: string,
): AsyncGenerator<DiscoveryEvent> {
  let entries = 0
  async function* walk(
    directory: string,
    depth: number,
  ): AsyncGenerator<DiscoveryEvent> {
    if (
      depth > PREPARATION_LIMITS.depth ||
      entries >= PREPARATION_LIMITS.entries
    ) {
      yield {
        kind: 'issue',
        issue: {
          code: 'LIMIT_EXCEEDED',
          relativePath: path.relative(root, directory),
        },
      }
      return
    }
    try {
      await verifyLocation(root, directory)
      const handle = await opendir(directory)
      for await (const entry of handle) {
        if (++entries > PREPARATION_LIMITS.entries) {
          yield {
            kind: 'issue',
            issue: {
              code: 'LIMIT_EXCEEDED',
              relativePath: path.relative(root, directory),
            },
          }
          return
        }
        const location = path.join(directory, entry.name)
        if (entry.isSymbolicLink()) {
          yield { kind: 'symlink' }
        } else if (entry.isDirectory()) {
          yield* walk(location, depth + 1)
        } else if (
          entry.isFile() &&
          AUDIO_FILE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
        ) {
          const relativePath = path.relative(root, location)
          try {
            await verifyLocation(root, location)
            const info = await lstat(location)
            if (!info.isFile()) {
              throw new Error('Source changed')
            }
            await access(location, constants.R_OK)
            yield {
              kind: 'file',
              file: {
                name: entry.name,
                path: location,
                relativePath,
                observedSizeBytes: info.size,
                observedMtimeMs: info.mtimeMs,
              },
            }
          } catch {
            yield {
              kind: 'issue',
              issue: { code: 'SOURCE_UNREADABLE', relativePath },
            }
          }
        }
      }
      await verifyLocation(root, directory)
    } catch {
      yield {
        kind: 'issue',
        issue: {
          code: 'SOURCE_UNREADABLE',
          relativePath: path.relative(root, directory),
        },
      }
    }
  }
  yield* walk(root, 0)
}
