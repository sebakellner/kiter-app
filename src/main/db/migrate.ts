import type Database from 'better-sqlite3'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { DbError } from './errors.ts'

export const DB_APPLICATION_ID = 0x4b495444
export const MIGRATIONS_TABLE = '__drizzle_migrations'

export function applyMigrations(
  native: Database.Database,
  migrationsFolder: string,
  initialize: () => void,
  validate: () => void
): void {
  const migrations = readMigrationFiles({ migrationsFolder })
  if (
    !migrations.length ||
    migrations.some(
      (migration, index) =>
        index > 0 && migration.folderMillis <= migrations[index - 1].folderMillis
    )
  ) {
    throw new DbError('UNSUPPORTED_VERSION', 'Invalid application migration history.')
  }
  // The native transaction includes migrations, profile bootstrap and integrity checks.
  // Drizzle's synchronous migrator starts its own BEGIN and cannot nest in this transaction.
  native
    .transaction(() => {
      const applicationId: unknown = native.pragma('application_id', { simple: true })
      const version: unknown = native.pragma('user_version', { simple: true })
      if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) {
        throw new DbError('UNSUPPORTED_VERSION', 'Invalid library schema version.')
      }
      const objects = native
        .prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'")
        .all()
      const fresh = applicationId === 0 && version === 0 && objects.length === 0
      if (!fresh) {
        if (applicationId !== DB_APPLICATION_ID) {
          throw new DbError('UNSUPPORTED_FORMAT', 'This file is not a supported Kiter database.')
        }
        if (version > migrations.length) {
          throw new DbError(
            'UNSUPPORTED_VERSION',
            'This library requires a newer version of Kiter.'
          )
        }
        if (
          !native
            .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = ?")
            .get(MIGRATIONS_TABLE)
        ) {
          throw new DbError('DB_INTEGRITY', 'The library migration history is missing.')
        }
      }
      native.exec(`CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at INTEGER NOT NULL
    ) STRICT`)
      const applied = native
        .prepare<[], { hash: string; created_at: number }>(
          `SELECT hash, created_at FROM ${MIGRATIONS_TABLE} ORDER BY id`
        )
        .all()
      if (
        applied.length !== version ||
        applied.some(
          (entry, index) =>
            entry.hash !== migrations[index]?.hash ||
            entry.created_at !== migrations[index]?.folderMillis
        )
      ) {
        throw new DbError(
          'DB_INTEGRITY',
          'The library migration history does not match this application.'
        )
      }
      const record = native.prepare(
        `INSERT INTO ${MIGRATIONS_TABLE}(hash, created_at) VALUES (?, ?)`
      )
      for (const migration of migrations.slice(applied.length)) {
        for (const statement of migration.sql) native.exec(statement)
        record.run(migration.hash, migration.folderMillis)
      }
      if (fresh) initialize()
      validate()
      native.pragma(`application_id = ${DB_APPLICATION_ID}`)
      native.pragma(`user_version = ${migrations.length}`)
    })
    .immediate()
}
