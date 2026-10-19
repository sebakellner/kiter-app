import path from 'node:path'
import type Database from 'better-sqlite3'
import { normalizeCatalogSearch } from '../../../shared/features/library/search.ts'

export function registerSearchFunctions(native: Database.Database): void {
  native.function(
    'kiter_search_text',
    { deterministic: true },
    (value: unknown) =>
      normalizeCatalogSearch(typeof value === 'string' ? value : ''),
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
