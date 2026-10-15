import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { test } from 'node:test'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import {
  openTestDatabase as open,
  createDiskDatabase,
  migrationsFolder,
} from './support/database/connection.ts'
import { makeDiscoveredAudioFile } from './support/fixtures/source.ts'
import { DB_APPLICATION_ID } from '../src/main/db/runtime/migrate.ts'
import { importFolder } from '../src/main/db/operations/sources/import.ts'
import { setFavorite } from '../src/main/db/operations/samples/favorites.ts'
import {
  readLocalProfile,
  setPreviewVolume,
} from '../src/main/db/operations/profile/operations.ts'
import * as schema from '../src/main/db/schema/index.ts'
import type { DiscoveredAudioFile } from '../src/shared/domain/source.ts'

function fileAt(
  root: string,
  relativePath = 'album/song.wav',
): DiscoveredAudioFile {
  return makeDiscoveredAudioFile(root, relativePath)
}

test('fresh initialization creates strict typed tables, migration history and one local profile', () => {
  const { db, native, close } = open()
  try {
    assert.equal(
      native.pragma('application_id', { simple: true }),
      DB_APPLICATION_ID,
    )
    assert.equal(native.pragma('user_version', { simple: true }), 1)
    assert.equal(native.pragma('foreign_keys', { simple: true }), 1)
    const tables = native
      .prepare<[], { name: string; strict: number }>('PRAGMA table_list')
      .all()
    assert.equal(Object.keys(schema).length, 17)
    for (const table of Object.values(schema)) {
      const config = getTableConfig(table)
      assert.ok(
        tables.some(
          (entry) => entry.name === config.name && entry.strict === 1,
        ),
      )
      const columns = native
        .prepare<[], { name: string }>(`PRAGMA table_info("${config.name}")`)
        .all()
      assert.deepEqual(
        columns.map((column) => column.name),
        config.columns.map((column) => column.name),
      )
      const definition = native
        .prepare<[string], { sql: string }>(
          'SELECT sql FROM sqlite_schema WHERE name = ?',
        )
        .get(config.name)?.sql
      for (const check of config.checks) {
        assert.ok(definition?.includes(`"${check.name}"`))
      }
      for (const index of config.indexes) {
        assert.ok(
          native
            .prepare('SELECT name FROM sqlite_schema WHERE name = ?')
            .get(index.config.name),
        )
      }
    }
    const local = readLocalProfile(db)
    assert.equal(local.profile.name, 'Local profile')
    assert.equal(local.profile.authorId, null)
    assert.equal(local.profile.avatarAssetId, null)
    assert.deepEqual(local.preferences, {
      profileId: local.profile.id,
      previewVolume: 1,
    })
    assert.throws(() =>
      native
        .prepare('INSERT INTO user_profiles(id, name) VALUES (?, ?)')
        .run(randomUUID(), 'Other'),
    )
    assert.equal(
      native
        .prepare<[], { count: number }>(
          'SELECT count(*) AS count FROM __drizzle_migrations',
        )
        .get()?.count,
      1,
    )
    assert.deepEqual(native.prepare('PRAGMA foreign_key_check').all(), [])
  } finally {
    close()
  }
})

test('database constraints preserve classification, ordering, credits and image boundaries', () => {
  const { native, close } = open()
  const category = randomUUID()
  const author = randomUUID()
  const asset = randomUUID()
  try {
    native
      .prepare('INSERT INTO categories VALUES (?, ?, ?)')
      .run(category, 'Drums', 'drums')
    assert.throws(() =>
      native
        .prepare('INSERT INTO categories VALUES (?, ?, ?)')
        .run(randomUUID(), 'DRUMS', 'drums'),
    )
    native
      .prepare('INSERT INTO authors VALUES (?, ?, ?)')
      .run(author, 'Producer', 'producer')
    native
      .prepare('INSERT INTO authors VALUES (?, ?, ?)')
      .run(randomUUID(), 'Producer', 'producer')
    assert.throws(() =>
      native
        .prepare('INSERT INTO samples(id, favorite) VALUES (?, ?)')
        .run(randomUUID(), 2),
    )
    assert.throws(() =>
      native
        .prepare('INSERT INTO samples(id, favorite) VALUES (?, ?)')
        .run(randomUUID(), 'invalid'),
    )
    const image = native.prepare(
      'INSERT INTO image_assets(id, storage_key, mime_type, byte_size, width, height) VALUES (?, ?, ?, ?, ?, ?)',
    )
    image.run(asset, `${asset}.png`, 'image/png', 10485760, 4096, 4096)
    for (const values of [
      [10485761, 4096, 4096],
      [1, 4097, 1],
      [1, 1, 4097],
      [0, 1, 1],
    ]) {
      const id = randomUUID()
      assert.throws(() => image.run(id, `${id}.png`, 'image/png', ...values))
    }
    const id = randomUUID()
    assert.throws(() => image.run(id, `${id}.jpg`, 'image/png', 1, 1, 1))
    const root = randomUUID(),
      pack = randomUUID(),
      sample = randomUUID(),
      collection = randomUUID()
    native
      .prepare('INSERT INTO source_roots(id, canonical_path) VALUES (?, ?)')
      .run(root, path.resolve('pack'))
    native
      .prepare('INSERT INTO packs(id, source_root_id, name) VALUES (?, ?, ?)')
      .run(pack, root, 'Pack')
    native
      .prepare('INSERT INTO samples(id, pack_id) VALUES (?, ?)')
      .run(sample, pack)
    native
      .prepare('INSERT INTO collections(id, name) VALUES (?, ?)')
      .run(collection, 'Collection')
    native
      .prepare('INSERT INTO collection_samples VALUES (?, ?, ?)')
      .run(collection, sample, 0)
    assert.throws(() =>
      native
        .prepare('INSERT INTO collection_samples VALUES (?, ?, ?)')
        .run(collection, sample, 1),
    )
    assert.throws(() =>
      native.prepare('UPDATE collection_samples SET position = -1').run(),
    )
    native.prepare('INSERT INTO pack_authors VALUES (?, ?)').run(pack, author)
    assert.deepEqual(native.prepare('SELECT * FROM sample_authors').all(), [])
    native.prepare('DELETE FROM packs WHERE id = ?').run(pack)
    assert.deepEqual(
      native.prepare('SELECT pack_id FROM samples WHERE id = ?').get(sample),
      {
        pack_id: null,
      },
    )
    assert.equal(
      native
        .prepare<[], { count: number }>(
          'SELECT count(*) AS count FROM collection_samples',
        )
        .get()?.count,
      1,
    )
  } finally {
    close()
  }
})

test('Sample IDs, Favorites and zero preview volume survive reopening and overlapping roots', async (t) => {
  const fixture = await createDiskDatabase(t)
  const dir = fixture.directory
  let connection = fixture.connection
  const file = fileAt(dir)
  const profile = readLocalProfile(connection.db)
  const [first] = importFolder(connection.db, dir, [file])
  setFavorite(connection.db, first.id, true)
  setPreviewVolume(connection.db, 0)
  connection = fixture.reopen()
  assert.deepEqual(readLocalProfile(connection.db), {
    ...profile,
    preferences: { profileId: profile.profile.id, previewVolume: 0 },
  })
  assert.deepEqual(importFolder(connection.db, dir, [file]), [
    { ...first, favorite: true },
  ])
  assert.deepEqual(importFolder(connection.db, dir, []), [])
  assert.equal(
    connection.native
      .prepare<[], { present: number }>(
        'SELECT present FROM source_root_samples',
      )
      .get()?.present,
    0,
  )
  const [overlap] = importFolder(connection.db, path.dirname(file.path), [
    { ...file, relativePath: file.name },
  ])
  assert.equal(overlap.id, first.id)
  assert.equal(overlap.favorite, true)
  const [copy] = importFolder(connection.db, dir, [
    fileAt(dir, 'copy/song.wav'),
  ])
  assert.notEqual(copy.id, first.id)
  assert.throws(() => setFavorite(connection.db, randomUUID(), true), {
    code: 'NOT_FOUND',
  })
  assert.throws(() => setFavorite(connection.db, first.id, 'true'), {
    code: 'INVALID_INPUT',
  })
  assert.equal(
    connection.native
      .prepare<[], { count: number }>(
        'SELECT count(*) AS count FROM __drizzle_migrations',
      )
      .get()?.count,
    1,
  )
})

test('changed source observations increment revision without changing user organization', () => {
  const { db, native, close } = open()
  const root = path.resolve('fixture'),
    file = fileAt(root)
  try {
    const [first] = importFolder(db, root, [file])
    setFavorite(db, first.id, true)
    native
      .prepare(
        "UPDATE samples SET display_name = 'Custom', notes = 'Keep', origin_assignment = 'manual' WHERE id = ?",
      )
      .run(first.id)
    importFolder(db, root, [file])
    assert.equal(
      native
        .prepare<[], { revision: number }>(
          'SELECT revision FROM sample_sources',
        )
        .get()?.revision,
      1,
    )
    importFolder(db, root, [{ ...file, observedSizeBytes: 200 }])
    assert.equal(
      native
        .prepare<[], { revision: number }>(
          'SELECT revision FROM sample_sources',
        )
        .get()?.revision,
      2,
    )
    assert.deepEqual(
      native
        .prepare(
          'SELECT display_name, notes, favorite, origin_assignment FROM samples',
        )
        .get(),
      {
        display_name: 'Custom',
        notes: 'Keep',
        favorite: 1,
        origin_assignment: 'manual',
      },
    )
    native.exec(`CREATE TRIGGER reject_source BEFORE INSERT ON sample_sources
      WHEN NEW.canonical_path LIKE '%blocked.wav'
      BEGIN SELECT RAISE(ABORT, 'Injected write failure'); END;`)
    assert.throws(() =>
      importFolder(db, root, [file, fileAt(root, 'blocked.wav')]),
    )
    assert.equal(
      native
        .prepare<[], { count: number }>('SELECT count(*) AS count FROM samples')
        .get()?.count,
      1,
    )
    assert.equal(
      native
        .prepare<[], { revision: number }>(
          'SELECT revision FROM sample_sources',
        )
        .get()?.revision,
      2,
    )
    assert.equal(
      native
        .prepare<[], { present: number }>(
          'SELECT present FROM source_root_samples',
        )
        .get()?.present,
      1,
    )
  } finally {
    close()
  }
})

test('exclusions, malformed inputs and invalid persisted IDs cannot partially import', () => {
  const { db, native, close } = open()
  const root = path.resolve('fixture'),
    file = fileAt(root)
  try {
    native.prepare('INSERT INTO excluded_sources VALUES (?)').run(file.path)
    assert.deepEqual(importFolder(db, root, [file]), [])
    assert.deepEqual(
      importFolder(db, path.dirname(file.path), [
        { ...file, relativePath: file.name },
      ]),
      [],
    )
    for (const files of [
      [fileAt(path.resolve('outside'))],
      [{ ...file, observedSizeBytes: NaN }],
      [file, file],
    ]) {
      assert.throws(() => importFolder(db, root, files), {
        code: 'INVALID_INPUT',
      })
    }
    native.exec('DELETE FROM excluded_sources; DELETE FROM source_roots')
    native
      .prepare('INSERT INTO source_roots(id, canonical_path) VALUES (?, ?)')
      .run('invalid', root)
    assert.throws(() => importFolder(db, root, [file]), {
      code: 'DB_INTEGRITY',
    })
    assert.equal(native.prepare('SELECT id FROM samples').get(), undefined)
    native.exec('DELETE FROM source_roots')
    native.prepare('INSERT INTO samples(id) VALUES (?)').run('invalid')
    native
      .prepare(
        `INSERT INTO sample_sources(sample_id, canonical_path, availability, last_checked_at)
      VALUES (?, ?, 'available', '2026-01-01T00:00:00.000Z')`,
      )
      .run('invalid', file.path)
    assert.throws(() => importFolder(db, root, [file]), {
      code: 'DB_INTEGRITY',
    })
    assert.equal(native.prepare('SELECT id FROM source_roots').get(), undefined)
    assert.equal(
      native
        .prepare<[], { observed_size_bytes: number | null }>(
          'SELECT observed_size_bytes FROM sample_sources',
        )
        .get()?.observed_size_bytes,
      null,
    )
  } finally {
    close()
  }
})

test('preview volume accepts inclusive endpoints and rejects invalid values without changing settings', () => {
  const { db, close } = open()
  try {
    assert.equal(setPreviewVolume(db, 0).previewVolume, 0)
    for (const value of [-0.001, 1.001, NaN, Infinity, null, '0.5']) {
      assert.throws(() => setPreviewVolume(db, value), {
        code: 'INVALID_INPUT',
      })
      assert.equal(readLocalProfile(db).preferences.previewVolume, 0)
    }
    assert.equal(setPreviewVolume(db, 1).previewVolume, 1)
  } finally {
    close()
  }
})

async function extendedMigrations(dir: string, sql: string): Promise<string> {
  const folder = path.join(dir, 'migrations')
  await cp(migrationsFolder, folder, { recursive: true })
  const journalFile = path.join(folder, 'meta', '_journal.json')
  const journal = JSON.parse(await readFile(journalFile, 'utf8'))
  journal.entries.push({
    idx: 1,
    version: '6',
    when: journal.entries[0].when + 1,
    tag: '0001_test',
    breakpoints: true,
  })
  await writeFile(journalFile, JSON.stringify(journal))
  await writeFile(path.join(folder, '0001_test.sql'), sql)
  return folder
}

test('pending migrations apply once and preserve existing data; older applications reject newer databases', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kiter-migrations-'))
  const filename = path.join(dir, 'kiter.sqlite')
  try {
    const original = open(filename)
    const profile = readLocalProfile(original.db)
    const [sample] = importFolder(original.db, dir, [fileAt(dir)])
    setFavorite(original.db, sample.id, true)
    original.close()
    const folder = await extendedMigrations(
      dir,
      'CREATE INDEX test_sample_notes ON samples(notes);',
    )
    for (let attempt = 0; attempt < 2; attempt++) {
      const upgraded = open(filename, folder)
      try {
        assert.equal(
          upgraded.native.pragma('user_version', { simple: true }),
          2,
        )
        assert.deepEqual(readLocalProfile(upgraded.db), profile)
        assert.deepEqual(importFolder(upgraded.db, dir, [fileAt(dir)]), [
          { ...sample, favorite: true },
        ])
        assert.equal(
          upgraded.native
            .prepare<[], { count: number }>(
              'SELECT count(*) AS count FROM __drizzle_migrations',
            )
            .get()?.count,
          2,
        )
      } finally {
        upgraded.close()
      }
    }
    assert.throws(() => open(filename), { code: 'UNSUPPORTED_VERSION' })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('failed migrations and bootstrap roll back SQL, migration history and version stamps', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kiter-migration-rollback-'))
  try {
    const filename = path.join(dir, 'existing.sqlite')
    const connection = open(filename)
    const profile = readLocalProfile(connection.db)
    connection.close()
    const folder = await extendedMigrations(
      dir,
      `CREATE INDEX rolled_back ON samples(notes);
      --> statement-breakpoint
      INSERT INTO table_that_does_not_exist VALUES (1);`,
    )
    assert.throws(() => open(filename, folder))
    const reopened = open(filename)
    try {
      assert.deepEqual(readLocalProfile(reopened.db), profile)
      assert.equal(reopened.native.pragma('user_version', { simple: true }), 1)
      assert.equal(
        reopened.native
          .prepare("SELECT name FROM sqlite_schema WHERE name = 'rolled_back'")
          .get(),
        undefined,
      )
    } finally {
      reopened.close()
    }
    await writeFile(
      path.join(folder, '0001_test.sql'),
      `CREATE TRIGGER reject_profile BEFORE INSERT ON user_profiles
      BEGIN SELECT RAISE(ABORT, 'Injected bootstrap failure'); END;`,
    )
    const fresh = path.join(dir, 'fresh.sqlite')
    assert.throws(() => open(fresh, folder))
    const inspect = new Database(fresh)
    try {
      assert.equal(inspect.pragma('application_id', { simple: true }), 0)
      assert.equal(inspect.pragma('user_version', { simple: true }), 0)
      assert.deepEqual(
        inspect
          .prepare(
            "SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'",
          )
          .all(),
        [],
      )
    } finally {
      inspect.close()
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('modified migration history, missing profile and orphan Samples fail without repair', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kiter-db-integrity-'))
  try {
    for (const sql of [
      "UPDATE __drizzle_migrations SET hash = 'tampered'",
      'DELETE FROM __drizzle_migrations',
      'DELETE FROM user_preferences',
      "INSERT INTO samples(id) VALUES ('invalid')",
    ]) {
      const filename = path.join(dir, `${randomUUID()}.sqlite`)
      const { native, close } = open(filename)
      native.exec(sql)
      close()
      assert.throws(() => open(filename), { code: 'DB_INTEGRITY' })
    }
    const original = await readFile(
      path.join(migrationsFolder, '0000_library-foundation.sql'),
      'utf8',
    )
    const folder = await extendedMigrations(dir, 'SELECT 1;')
    await writeFile(
      path.join(folder, '0000_library-foundation.sql'),
      `${original}\n-- changed`,
    )
    const filename = path.join(dir, 'changed-package.sqlite')
    open(filename).close()
    assert.throws(() => open(filename, folder), { code: 'DB_INTEGRITY' })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('foreign, nonempty unmarked and corrupt files remain unchanged; previous databases are untouched', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kiter-db-format-'))
  try {
    for (const [name, applicationId, version, code] of [
      ['foreign', 7, 1, 'UNSUPPORTED_FORMAT'],
      ['newer', DB_APPLICATION_ID, 99, 'UNSUPPORTED_VERSION'],
      ['invalid', DB_APPLICATION_ID, -1, 'UNSUPPORTED_VERSION'],
      ['unmarked', 0, 0, 'UNSUPPORTED_FORMAT'],
    ] as const) {
      const filename = path.join(dir, `${name}.sqlite`)
      const inspect = new Database(filename)
      try {
        inspect.exec(`PRAGMA application_id = ${applicationId}; PRAGMA user_version = ${version};
          CREATE TABLE preserved(value TEXT); INSERT INTO preserved VALUES ('Keep');`)
        assert.throws(() => open(filename), { code })
        assert.equal(inspect.pragma('user_version', { simple: true }), version)
        assert.deepEqual(inspect.prepare('SELECT value FROM preserved').get(), {
          value: 'Keep',
        })
      } finally {
        inspect.close()
      }
    }
    const contents = Buffer.from('not a SQLite database')
    for (const name of ['catalog.sqlite', 'library.sqlite', 'corrupt.sqlite']) {
      await writeFile(path.join(dir, name), contents)
    }
    assert.throws(() => open(path.join(dir, 'corrupt.sqlite')))
    open(path.join(dir, 'kiter.sqlite')).close()
    for (const name of ['catalog.sqlite', 'library.sqlite', 'corrupt.sqlite']) {
      assert.deepEqual(await readFile(path.join(dir, name)), contents)
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
