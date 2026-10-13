import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { CatalogStore } from '../src/main/services/catalog/catalogStore.ts'

test('stable IDs and favorites survive reopening, rescans and overlapping roots', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kiter-catalog-'))
  const filename = path.join(dir, 'catalog.sqlite')
  const file = {
    name: 'song.wav',
    path: path.join(dir, 'album', 'song.wav'),
    relativePath: 'album/song.wav'
  }
  let store = new CatalogStore(filename)
  try {
    const [first] = store.importFolder(dir, [file])
    assert.match(first.id, /^[0-9a-f-]{36}$/)
    assert.equal(first.favorite, false)
    assert.deepEqual(store.setFavorite(first.id, true), { id: first.id, favorite: true })
    assert.deepEqual(store.importFolder(dir, [file]), [{ ...first, favorite: true }])
    store.close()
    store = new CatalogStore(filename)
    const [reopened] = store.importFolder(dir, [file])
    assert.deepEqual(reopened, { ...first, favorite: true })
    assert.deepEqual(store.importFolder(dir, []), [])
    assert.deepEqual(
      store.importFolder(dir, [file]),
      [reopened],
      'Absent samples retain their record'
    )
    const [overlapping] = store.importFolder(path.dirname(file.path), [
      { ...file, relativePath: file.name }
    ])
    assert.equal(overlapping.id, first.id)
    assert.equal(overlapping.favorite, true)
    const [other] = store.importFolder(dir, [{ ...file, path: path.join(dir, 'copy', file.name) }])
    assert.notEqual(other.id, first.id, 'Different locations must not merge by name')
    assert.equal(other.favorite, false)
    store.setFavorite(first.id, false)
    store.close()
    store = new CatalogStore(filename)
    assert.equal(store.importFolder(dir, [file])[0].favorite, false)
    assert.throws(() => store.setFavorite('unknown', true), /not registered/)
  } finally {
    store.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test('a failed folder transaction rolls back without losing previous favorites', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kiter-catalog-rollback-'))
  const filename = path.join(dir, 'catalog.sqlite')
  const file = { name: 'song.wav', path: path.join(dir, 'song.wav'), relativePath: 'song.wav' }
  const store = new CatalogStore(filename)
  const inspect = new DatabaseSync(filename)
  try {
    const [first] = store.importFolder(dir, [file])
    store.setFavorite(first.id, true)
    inspect.exec(`
      CREATE TRIGGER reject_new_sample BEFORE INSERT ON samples
      WHEN NEW.path LIKE '%blocked.wav'
      BEGIN SELECT RAISE(ABORT, 'Injected write failure'); END;
    `)
    assert.throws(
      () =>
        store.importFolder(dir, [
          file,
          { name: 'blocked.wav', path: path.join(dir, 'blocked.wav'), relativePath: 'blocked.wav' }
        ]),
      /Injected write failure/
    )
    assert.equal(inspect.prepare('SELECT count(*) AS count FROM samples').get()?.count, 1)
    assert.equal(inspect.prepare('SELECT available FROM root_samples').get()?.available, 1)
    assert.equal(store.importFolder(dir, [file])[0].favorite, true)
  } finally {
    inspect.close()
    store.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test('unsupported catalog versions are rejected without resetting the database', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kiter-catalog-version-'))
  const filename = path.join(dir, 'catalog.sqlite')
  const db = new DatabaseSync(filename)
  try {
    db.exec('PRAGMA user_version = 99; CREATE TABLE preserved(value TEXT);')
    assert.throws(() => new CatalogStore(filename), /newer/)
    assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, 99)
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='preserved'").get())
  } finally {
    db.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test('a corrupt catalog fails explicitly without replacing its contents', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kiter-catalog-corrupt-'))
  const filename = path.join(dir, 'catalog.sqlite')
  const contents = Buffer.from('not a SQLite database')
  try {
    await writeFile(filename, contents)
    assert.throws(() => new CatalogStore(filename), /not a database/)
    assert.deepEqual(await readFile(filename), contents)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
