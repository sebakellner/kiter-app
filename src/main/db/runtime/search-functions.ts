import path from 'node:path'
import type Database from 'better-sqlite3'
import { normalizeCatalogSearch } from '../../../shared/features/library/search.ts'

// Canonical paths are host-native; backslashes are valid filename characters on
// POSIX, so only Windows treats them as separators.
export function kiterFilename(file: string): string {
  if (process.platform === 'win32') {
    return file.split(/[\\/]/u).pop() ?? file
  }
  return file.slice(file.lastIndexOf('/') + 1)
}

export function registerSearchFunctions(native: Database.Database): void {
  native.function(
    'kiter_search_text',
    { deterministic: true },
    (value: unknown) =>
      normalizeCatalogSearch(typeof value === 'string' ? value : ''),
  )
  native.function(
    'kiter_filename',
    { deterministic: true },
    (file: unknown) => {
      if (typeof file !== 'string') {
        throw new TypeError('Invalid catalog source path.')
      }
      return kiterFilename(file)
    },
  )
  native.function(
    'kiter_relative_path',
    { deterministic: true },
    (file: unknown, root: unknown) => {
      if (typeof file !== 'string') {
        throw new TypeError('Invalid catalog source path.')
      }
      return typeof root === 'string'
        ? path.relative(root, file)
        : path.basename(file)
    },
  )
}
