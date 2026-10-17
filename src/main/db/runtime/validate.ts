import type Database from 'better-sqlite3'
import { getTableName } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { DbError } from '../errors.ts'
import { readLocalProfile } from '../operations/profile/operations.ts'
import * as schema from '../schema/index.ts'
import { MIGRATIONS_TABLE } from './migrate.ts'

export function validateCatalog(native: Database.Database): void {
  const tables = native
    .prepare<[], { name: string; strict: number }>('PRAGMA table_list')
    .all()
  const expected = [
    ...Object.values(schema).map(getTableName),
    MIGRATIONS_TABLE,
  ]
  const actual = tables.filter((table) => !table.name.startsWith('sqlite_'))
  if (
    actual.length !== expected.length ||
    expected.some(
      (name) =>
        !actual.some((table) => table.name === name && table.strict === 1),
    )
  ) {
    throw new DbError(
      'DB_INTEGRITY',
      'The local database failed its schema checks.',
    )
  }
  validateStoredCatalog(native)
}

// A supported older snapshot need not have the current schema. Its history is
// checked separately, and full current-schema validation follows migration.
export function validateStoredCatalog(native: Database.Database): void {
  if (
    native
      .prepare<[], { name: string; strict: number }>('PRAGMA table_list')
      .all()
      .some(
        (table) => !table.name.startsWith('sqlite_') && table.strict !== 1,
      ) ||
    native.pragma('quick_check', { simple: true }) !== 'ok' ||
    native.prepare('PRAGMA foreign_key_check').get() ||
    native
      .prepare(
        `SELECT s.id FROM samples s
         LEFT JOIN sample_sources f ON f.sample_id = s.id
         WHERE f.sample_id IS NULL LIMIT 1`,
      )
      .get()
  ) {
    throw new DbError(
      'DB_INTEGRITY',
      'The local database failed its integrity checks.',
    )
  }
  readLocalProfile(drizzle(native, { schema }))
}
