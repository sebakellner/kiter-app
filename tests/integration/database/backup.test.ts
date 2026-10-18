import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
  cp,
  mkdir,
  readFile,
  readdir,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import Database from 'better-sqlite3'
import { openDatabase } from '../../../src/main/db/runtime/connection.ts'
import {
  createProtectiveBackup,
  restoreBackup,
  verifyBackup,
} from '../../../src/main/db/runtime/backup.ts'
import { importFolder } from '../../../src/main/db/operations/sources/import.ts'
import { setFavorite } from '../../../src/main/db/operations/samples/favorites.ts'
import {
  readLocalProfile,
  setPreviewVolume,
} from '../../../src/main/db/operations/profile/operations.ts'
import { migrationsFolder } from '../../support/database/connection.ts'
import { createTemporaryDirectory } from '../../support/filesystem/temporary-directory.ts'
import { makeDiscoveredAudioFile } from '../../support/fixtures/source.ts'
import { WorkerTransport } from '../../../src/main/db/client/worker-transport.ts'
import type { LibrarySample } from '../../../src/shared/ipc/library.ts'
import type { BackupStorage } from '../../../src/main/db/runtime/backup.ts'

async function fixture(
  t: Parameters<typeof createTemporaryDirectory>[0],
): Promise<{
  directory: string
  filename: string
  storage: BackupStorage
  connection: ReturnType<typeof openDatabase>
  sample: LibrarySample
}> {
  const directory = await createTemporaryDirectory(t, 'backup')
  const filename = join(directory.path, 'kiter.sqlite')
  const storage = {
    backupDirectory: join(directory.path, 'backups'),
    imagesDirectory: join(directory.path, 'library', 'images'),
  }
  const connection = openDatabase(filename, migrationsFolder, storage)
  directory.beforeRemove(() => {
    if (connection.native.open) {
      connection.close()
    }
  })
  const [sample] = importFolder(connection.db, directory.path, [
    makeDiscoveredAudioFile(directory.path),
  ])
  setFavorite(connection.db, sample.id, true)
  setPreviewVolume(connection.db, 0)
  return { directory: directory.path, filename, storage, connection, sample }
}

async function upgradeFolder(
  directory: string,
  sql = 'CREATE INDEX backup_test ON samples(notes);',
): Promise<string> {
  const folder = join(directory, 'migrations')
  await cp(migrationsFolder, folder, { recursive: true })
  const journalPath = join(folder, 'meta', '_journal.json')
  const journal = JSON.parse(await readFile(journalPath, 'utf8'))
  journal.entries.push({
    idx: journal.entries.length,
    version: '6',
    when: journal.entries.at(-1).when + 1,
    tag: '0002_test',
    breakpoints: true,
  })
  await writeFile(journalPath, JSON.stringify(journal))
  await writeFile(join(folder, '0002_test.sql'), sql)
  return folder
}

test('upgrades create a verified pre-migration snapshot once; fresh and unchanged catalogs create none', async (t) => {
  const f = await fixture(t)
  assert.deepEqual(await readdir(f.directory), ['kiter.sqlite'])
  const profile = readLocalProfile(f.connection.db)
  f.connection.close()
  const folder = await upgradeFolder(f.directory)
  const upgraded = openDatabase(f.filename, folder, f.storage)
  upgraded.close()
  const backups = await readdir(f.storage.backupDirectory)
  assert.equal(backups.length, 1)
  const backup = join(f.storage.backupDirectory, backups[0])
  const manifest = verifyBackup(backup, folder)
  assert.equal(manifest.schemaVersion, 2)
  assert.equal(manifest.kind, 'pre-migration')
  const saved = openDatabase(join(backup, 'catalog.sqlite'), migrationsFolder)
  assert.deepEqual(readLocalProfile(saved.db), profile)
  assert.deepEqual(
    saved.native.prepare('SELECT id, favorite FROM samples').get(),
    { id: f.sample.id, favorite: 1 },
  )
  saved.close()
  openDatabase(f.filename, folder, f.storage).close()
  assert.deepEqual(await readdir(f.storage.backupDirectory), backups)
  const fresh = join(f.directory, 'fresh.sqlite')
  openDatabase(fresh, folder, f.storage).close()
  assert.deepEqual(await readdir(f.storage.backupDirectory), backups)
})

test('backup failure blocks all migration SQL and permits retry at another destination', async (t) => {
  const f = await fixture(t)
  f.connection.close()
  const original = await readFile(f.filename)
  const folder = await upgradeFolder(f.directory)
  await writeFile(f.storage.backupDirectory, 'blocked')
  assert.throws(() => openDatabase(f.filename, folder, f.storage), {
    code: 'BACKUP_FAILED',
  })
  assert.deepEqual(await readFile(f.filename), original)
  const retried = openDatabase(f.filename, folder, {
    ...f.storage,
    backupDirectory: join(f.directory, 'alternative'),
  })
  assert.equal(retried.native.pragma('user_version', { simple: true }), 3)
  assert.deepEqual(
    retried.native.prepare('SELECT id, favorite FROM samples').get(),
    { id: f.sample.id, favorite: 1 },
  )
  retried.close()
})

test('a failed migration retains both the unchanged library and its usable protective copy', async (t) => {
  const f = await fixture(t)
  f.connection.close()
  const folder = await upgradeFolder(
    f.directory,
    'UPDATE samples SET favorite = 0;\n--> statement-breakpoint\nINSERT INTO missing_table VALUES (1);',
  )
  assert.throws(() => openDatabase(f.filename, folder, f.storage))
  const backups = await readdir(f.storage.backupDirectory)
  assert.equal(backups.length, 1)
  verifyBackup(join(f.storage.backupDirectory, backups[0]), folder)
  const reopened = openDatabase(f.filename, migrationsFolder)
  assert.deepEqual(
    reopened.native.prepare('SELECT id, favorite FROM samples').get(),
    { id: f.sample.id, favorite: 1 },
  )
  assert.equal(reopened.native.pragma('user_version', { simple: true }), 2)
  reopened.close()
})

test('snapshot includes committed WAL data and referenced images, excludes originals and rejects tampering before restoration', async (t) => {
  const f = await fixture(t)
  await mkdir(f.storage.imagesDirectory, { recursive: true })
  const id = randomUUID()
  const image = Buffer.from('immutable-image-fixture')
  await writeFile(join(f.storage.imagesDirectory, `${id}.png`), image)
  await writeFile(join(f.directory, 'original.wav'), 'unchanged audio')
  f.connection.native.pragma('journal_mode = WAL')
  f.connection.native
    .prepare('INSERT INTO image_assets VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, `${id}.png`, 'image/png', image.length, 1, 1, 'ready')
  f.connection.native
    .prepare('UPDATE user_profiles SET avatar_asset_id = ?')
    .run(id)
  const backup = createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  assert.deepEqual((await readdir(backup)).sort(), [
    'catalog.sqlite',
    'images',
    'manifest.json',
  ])
  assert.deepEqual(await readFile(join(backup, 'images', `${id}.png`)), image)
  assert.deepEqual(
    verifyBackup(backup, migrationsFolder).images.map((entry) => entry.name),
    [`${id}.png`],
  )
  const saved = new Database(join(backup, 'catalog.sqlite'), { readonly: true })
  assert.deepEqual(saved.prepare('SELECT id, favorite FROM samples').get(), {
    id: f.sample.id,
    favorite: 1,
  })
  saved.close()
  f.connection.close()
  const before = await readFile(f.filename)
  await writeFile(join(backup, 'images', `${id}.png`), 'tampered')
  assert.throws(
    () => restoreBackup(f.filename, backup, migrationsFolder, f.storage),
    { code: 'DB_INTEGRITY' },
  )
  assert.deepEqual(await readFile(f.filename), before)
  assert.equal(
    await readFile(join(f.directory, 'original.wav'), 'utf8'),
    'unchanged audio',
  )
})

test('restoration preserves current state in a protective copy and restores identities, favorites and zero volume', async (t) => {
  const f = await fixture(t)
  const backup = createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  setFavorite(f.connection.db, f.sample.id, false)
  setPreviewVolume(f.connection.db, 0.5)
  f.connection.close()
  restoreBackup(f.filename, backup, migrationsFolder, f.storage)
  const restored = openDatabase(f.filename, migrationsFolder)
  assert.deepEqual(
    restored.native.prepare('SELECT id, favorite FROM samples').get(),
    { id: f.sample.id, favorite: 1 },
  )
  assert.equal(readLocalProfile(restored.db).preferences.previewVolume, 0)
  restored.close()
  const manifests = (await readdir(f.storage.backupDirectory)).map((entry) => ({
    folder: join(f.storage.backupDirectory, entry),
    manifest: verifyBackup(
      join(f.storage.backupDirectory, entry),
      migrationsFolder,
    ),
  }))
  const protective = manifests.find(
    (entry) => entry.manifest.kind === 'pre-restoration',
  )
  assert.ok(protective)
  const previous = new Database(join(protective.folder, 'catalog.sqlite'), {
    readonly: true,
  })
  assert.deepEqual(previous.prepare('SELECT id, favorite FROM samples').get(), {
    id: f.sample.id,
    favorite: 0,
  })
  assert.equal(
    previous
      .prepare<[], { preview_volume: number }>(
        'SELECT preview_volume FROM user_preferences',
      )
      .get()?.preview_volume,
    0.5,
  )
  previous.close()
})

test('restoration refuses incompatible versions and failed current-state protection without replacing data', async (t) => {
  const f = await fixture(t)
  const backup = createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  f.connection.close()
  const before = await readFile(f.filename)
  const manifestPath = join(backup, 'manifest.json')
  const originalManifest = await readFile(manifestPath, 'utf8')
  await writeFile(
    manifestPath,
    originalManifest.replace('"version": 1', '"version": 999'),
  )
  assert.throws(
    () => restoreBackup(f.filename, backup, migrationsFolder, f.storage),
    { code: 'UNSUPPORTED_FORMAT' },
  )
  await writeFile(manifestPath, originalManifest)
  const blocked = join(f.directory, 'blocked')
  await writeFile(blocked, 'not a directory')
  assert.throws(
    () =>
      restoreBackup(f.filename, backup, migrationsFolder, {
        ...f.storage,
        backupDirectory: blocked,
      }),
    { code: 'BACKUP_FAILED' },
  )
  assert.deepEqual(await readFile(f.filename), before)
})

test('missing or linked managed images block migration rather than publishing incomplete backups', async (t) => {
  const f = await fixture(t)
  const id = randomUUID()
  f.connection.native
    .prepare('INSERT INTO image_assets VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, `${id}.png`, 'image/png', 1, 1, 1, 'ready')
  f.connection.native
    .prepare('UPDATE user_profiles SET avatar_asset_id = ?')
    .run(id)
  assert.throws(
    () =>
      createProtectiveBackup(
        f.connection.native,
        f.filename,
        migrationsFolder,
        f.storage,
      ),
    { code: 'BACKUP_FAILED' },
  )
  assert.deepEqual(await readdir(f.storage.backupDirectory), [])
  if (process.platform === 'win32') {
    t.diagnostic(
      'Symbolic-link creation requires privileges on Windows; missing-image protection was verified.',
    )
    return
  }
  await mkdir(f.storage.imagesDirectory, { recursive: true })
  const outside = join(f.directory, 'outside.png')
  await writeFile(outside, 'x')
  await symlink(outside, join(f.storage.imagesDirectory, `${id}.png`))
  assert.throws(
    () =>
      createProtectiveBackup(
        f.connection.native,
        f.filename,
        migrationsFolder,
        f.storage,
      ),
    { code: 'BACKUP_FAILED' },
  )
  assert.deepEqual(await readdir(f.storage.backupDirectory), [])
  assert.equal(await readFile(outside, 'utf8'), 'x')
})

test('worker startup protects pending migrations and restores before accepting commands', async (t) => {
  const f = await fixture(t)
  const backup = createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  setFavorite(f.connection.db, f.sample.id, false)
  f.connection.close()
  const folder = await upgradeFolder(f.directory)
  const transport = await WorkerTransport.open(f.filename, {
    workerPath: new URL(
      '../../../src/main/db/worker/entry.ts',
      import.meta.url,
    ),
    migrationsFolder: folder,
    ...f.storage,
    restoreFrom: backup,
  })
  try {
    const reply = await transport.request({
      action: 'import',
      root: f.directory,
      files: [makeDiscoveredAudioFile(f.directory)],
    })
    assert.equal(reply.action, 'import')
    if (reply.action === 'import') {
      assert.equal(reply.result[0].id, f.sample.id)
      assert.equal(reply.result[0].favorite, true)
    }
    const manifests = (await readdir(f.storage.backupDirectory)).map((entry) =>
      verifyBackup(join(f.storage.backupDirectory, entry), folder),
    )
    assert.equal(manifests.length, 3)
    assert.ok(manifests.some((entry) => entry.kind === 'pre-restoration'))
  } finally {
    await transport.close()
  }
})

test('restoration republishes missing immutable images and refuses conflicting existing copies', async (t) => {
  const f = await fixture(t)
  await mkdir(f.storage.imagesDirectory, { recursive: true })
  const id = randomUUID()
  const image = Buffer.from('saved immutable cover')
  const imagePath = join(f.storage.imagesDirectory, `${id}.png`)
  await writeFile(imagePath, image)
  f.connection.native
    .prepare('INSERT INTO image_assets VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, `${id}.png`, 'image/png', image.length, 1, 1, 'ready')
  f.connection.native
    .prepare('UPDATE user_profiles SET avatar_asset_id = ?')
    .run(id)
  const backup = createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  f.connection.native.exec(
    'UPDATE user_profiles SET avatar_asset_id = NULL; DELETE FROM image_assets;',
  )
  f.connection.close()
  await writeFile(imagePath, 'conflicting copy')
  const before = await readFile(f.filename)
  assert.throws(
    () => restoreBackup(f.filename, backup, migrationsFolder, f.storage),
    { code: 'DB_INTEGRITY' },
  )
  assert.deepEqual(await readFile(f.filename), before)
  assert.equal(await readFile(imagePath, 'utf8'), 'conflicting copy')
  const { unlink } = await import('node:fs/promises')
  await unlink(imagePath)
  restoreBackup(f.filename, backup, migrationsFolder, f.storage)
  assert.deepEqual(await readFile(imagePath), image)
  const restored = openDatabase(f.filename, migrationsFolder)
  assert.equal(readLocalProfile(restored.db).profile.avatarAssetId, id)
  restored.close()
})

test('damaged current catalogs are preserved instead of being replaced by a valid backup', async (t) => {
  const f = await fixture(t)
  const backup = createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  f.connection.native.exec('DELETE FROM user_preferences')
  f.connection.close()
  const before = await readFile(f.filename)
  assert.throws(
    () => restoreBackup(f.filename, backup, migrationsFolder, f.storage),
    { code: 'BACKUP_FAILED' },
  )
  assert.deepEqual(await readFile(f.filename), before)
  assert.equal((await readdir(f.storage.backupDirectory)).length, 1)
})
