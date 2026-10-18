import type Database from 'better-sqlite3'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { DbError } from '../errors.ts'

export const DB_APPLICATION_ID = 0x4b495444
export const MIGRATIONS_TABLE = '__drizzle_migrations'

export function applyMigrations(
  native: Database.Database,
  migrationsFolder: string,
  initialize: () => void,
  validate: () => void,
  protect: () => void,
  initializeVocabulary: (fresh: boolean) => void,
): void {
  const { migrations, fresh, version } = inspectMigrations(
    native,
    migrationsFolder,
  )
  if (!fresh && version < migrations.length) {
    protect()
  }
  // The worker has not accepted commands yet. Recheck history under the write
  // lock after the filesystem snapshot, before changing any catalog data.
  native
    .transaction(() => {
      const current = inspectMigrations(native, migrationsFolder)
      if (current.version !== version || current.fresh !== fresh) {
        throw new DbError(
          'DB_INTEGRITY',
          'The library changed during migration preparation.',
        )
      }
      native.exec(`CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
        id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at INTEGER NOT NULL
      ) STRICT`)
      const record = native.prepare(
        `INSERT INTO ${MIGRATIONS_TABLE}(hash, created_at) VALUES (?, ?)`,
      )
      for (const migration of migrations.slice(version)) {
        for (const statement of migration.sql) {
          native.exec(statement)
        }
        record.run(migration.hash, migration.folderMillis)
      }
      if (fresh) {
        initialize()
      }
      initializeVocabulary(fresh)
      validate()
      native.pragma(`application_id = ${DB_APPLICATION_ID}`)
      native.pragma(`user_version = ${migrations.length}`)
    })
    .immediate()
}

export function inspectMigrations(
  native: Database.Database,
  migrationsFolder: string,
): {
  migrations: ReturnType<typeof readMigrationFiles>
  fresh: boolean
  version: number
} {
  const migrations = readMigrationFiles({ migrationsFolder })
  if (
    !migrations.length ||
    migrations.some(
      (migration, index) =>
        index > 0 &&
        migration.folderMillis <= migrations[index - 1].folderMillis,
    )
  ) {
    throw new DbError(
      'UNSUPPORTED_VERSION',
      'Invalid application migration history.',
    )
  }
  const applicationId: unknown = native.pragma('application_id', {
    simple: true,
  })
  const version: unknown = native.pragma('user_version', { simple: true })
  if (
    typeof version !== 'number' ||
    !Number.isSafeInteger(version) ||
    version < 0
  ) {
    throw new DbError('UNSUPPORTED_VERSION', 'Invalid library schema version.')
  }
  const objects = native
    .prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'")
    .all()
  const fresh = applicationId === 0 && version === 0 && objects.length === 0
  if (!fresh) {
    if (applicationId !== DB_APPLICATION_ID) {
      throw new DbError(
        'UNSUPPORTED_FORMAT',
        'This file is not a supported Kiter database.',
      )
    }
    if (version > migrations.length) {
      throw new DbError(
        'UNSUPPORTED_VERSION',
        'This library requires a newer version of Kiter.',
      )
    }
    if (
      !native
        .prepare(
          "SELECT name FROM sqlite_schema WHERE type = 'table' AND name = ?",
        )
        .get(MIGRATIONS_TABLE)
    ) {
      throw new DbError(
        'DB_INTEGRITY',
        'The library migration history is missing.',
      )
    }
  }
  const applied = fresh
    ? []
    : native
        .prepare<[], { hash: string; created_at: number }>(
          `SELECT hash, created_at FROM ${MIGRATIONS_TABLE} ORDER BY id`,
        )
        .all()
  if (
    applied.length !== version ||
    applied.some(
      (entry, index) =>
        entry.hash !== migrations[index]?.hash ||
        entry.created_at !== migrations[index]?.folderMillis,
    )
  ) {
    throw new DbError(
      'DB_INTEGRITY',
      'The library migration history does not match this application.',
    )
  }
  return { migrations, fresh, version }
}
