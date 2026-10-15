import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { getTableName } from 'drizzle-orm'
import {
  DEFAULT_PREVIEW_VOLUME,
  DEFAULT_PROFILE_NAME,
} from '../../../shared/domain/profile.ts'
import { DbError } from '../errors.ts'
import { applyMigrations, MIGRATIONS_TABLE } from './migrate.ts'
import { readLocalProfile } from '../operations/profile/operations.ts'
import * as schema from '../schema/index.ts'

export type AppDatabase = BetterSQLite3Database<typeof schema>

export function openDatabase(
  filename: string,
  migrationsFolder: string,
): {
  db: AppDatabase
  native: Database.Database
  close: () => void
} {
  const native = new Database(filename, { timeout: 5000 })
  const db = drizzle(native, { schema })
  try {
    native.pragma('foreign_keys = ON')
    applyMigrations(
      native,
      migrationsFolder,
      () => {
        const profileId = randomUUID()
        db.insert(schema.userProfiles)
          .values({ id: profileId, name: DEFAULT_PROFILE_NAME })
          .run()
        db.insert(schema.userPreferences)
          .values({ profileId, previewVolume: DEFAULT_PREVIEW_VOLUME })
          .run()
      },
      () => {
        const tables = native
          .prepare<[], { name: string; strict: number }>('PRAGMA table_list')
          .all()
        const expected = [
          ...Object.values(schema).map(getTableName),
          MIGRATIONS_TABLE,
        ]
        const actual = tables.filter(
          (table) => !table.name.startsWith('sqlite_'),
        )
        if (
          actual.length !== expected.length ||
          expected.some(
            (name) =>
              !actual.some(
                (table) => table.name === name && table.strict === 1,
              ),
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
        readLocalProfile(db)
      },
    )
    return { db, native, close: () => native.close() }
  } catch (error) {
    native.close()
    throw error
  }
}
