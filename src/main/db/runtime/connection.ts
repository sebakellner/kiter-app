import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import {
  DEFAULT_PREVIEW_VOLUME,
  DEFAULT_PROFILE_NAME,
} from '../../../shared/domain/profile.ts'
import { applyMigrations } from './migrate.ts'
import { validateCatalog } from './validate.ts'
import { createProtectiveBackup, type BackupStorage } from './backup.ts'
import * as schema from '../schema/index.ts'
import { initializeRecognitionVocabulary } from '../operations/classification/vocabulary.ts'
import { registerSearchFunctions } from './search-functions.ts'

export type AppDatabase = BetterSQLite3Database<typeof schema>

export function openDatabase(
  filename: string,
  migrationsFolder: string,
  storage?: BackupStorage,
): {
  db: AppDatabase
  native: Database.Database
  close: () => void
} {
  const native = new Database(filename, { timeout: 5000 })
  const db = drizzle(native, { schema })
  try {
    registerSearchFunctions(native)
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
      () => validateCatalog(native),
      () => createProtectiveBackup(native, filename, migrationsFolder, storage),
      (fresh) => initializeRecognitionVocabulary(db, fresh),
    )
    return { db, native, close: () => native.close() }
  } catch (error) {
    native.close()
    throw error
  }
}
