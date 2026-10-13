import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import type { AudioFile, CatalogSample, FavoriteState } from '../../../shared/ipc'

const SQLITE_BUSY_TIMEOUT_MS = 5000
const CATALOG_SCHEMA_VERSION = 1
const UNVERSIONED_SCHEMA_VERSION = 0

export class CatalogStore {
  private readonly db: DatabaseSync

  constructor(filename: string) {
    this.db = new DatabaseSync(filename)
    try {
      this.configureDatabase()
      this.initializeSchema()
    } catch (error) {
      this.db.close()
      throw error
    }
  }

  private configureDatabase(): void {
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS};
    `)
  }

  private initializeSchema(): void {
    const version = this.db.prepare('PRAGMA user_version').get()?.user_version
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
      throw new Error('Invalid catalog schema version')
    }
    if (version === CATALOG_SCHEMA_VERSION) return
    if (version !== UNVERSIONED_SCHEMA_VERSION) {
      const compatibility = version > CATALOG_SCHEMA_VERSION ? 'newer' : 'older'
      throw new Error(
        `Catalog schema version ${version} is ${compatibility} than supported version ${CATALOG_SCHEMA_VERSION}`
      )
    }
    this.db.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE roots (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE
      ) STRICT;
      CREATE TABLE samples (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1))
      ) STRICT;
      CREATE TABLE root_samples (
        root_id TEXT NOT NULL REFERENCES roots(id),
        sample_id TEXT NOT NULL REFERENCES samples(id),
        available INTEGER NOT NULL CHECK (available IN (0, 1)),
        PRIMARY KEY (root_id, sample_id)
      ) STRICT;
      PRAGMA user_version = ${CATALOG_SCHEMA_VERSION};
      COMMIT;
    `)
  }

  importFolder(root: string, files: AudioFile[]): CatalogSample[] {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db
        .prepare('INSERT INTO roots(id, path) VALUES (?, ?) ON CONFLICT(path) DO NOTHING')
        .run(randomUUID(), root)
      const rootId = this.db.prepare('SELECT id FROM roots WHERE path = ?').get(root)?.id
      if (typeof rootId !== 'string') throw new Error('Invalid catalog root record')
      this.db.prepare('UPDATE root_samples SET available = 0 WHERE root_id = ?').run(rootId)
      const insert = this.db.prepare(
        'INSERT INTO samples(id, path) VALUES (?, ?) ON CONFLICT(path) DO NOTHING'
      )
      const select = this.db.prepare('SELECT id, favorite FROM samples WHERE path = ?')
      const associate = this.db.prepare(`
        INSERT INTO root_samples(root_id, sample_id, available) VALUES (?, ?, 1)
        ON CONFLICT(root_id, sample_id) DO UPDATE SET available = 1
      `)
      const result = files.map((file) => {
        insert.run(randomUUID(), file.path)
        const row = select.get(file.path)
        if (typeof row?.id !== 'string' || (row.favorite !== 0 && row.favorite !== 1)) {
          throw new Error('Invalid catalog sample record')
        }
        associate.run(rootId, row.id)
        return { ...file, id: row.id, favorite: row.favorite === 1 }
      })
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  setFavorite(id: string, favorite: boolean): FavoriteState {
    const result = this.db
      .prepare('UPDATE samples SET favorite = ? WHERE id = ?')
      .run(favorite ? 1 : 0, id)
    if (result.changes !== 1) throw new Error('Sample is not registered in the catalog')
    return { id, favorite }
  }

  close(): void {
    this.db.close()
  }
}
