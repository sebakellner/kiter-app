import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { test } from 'node:test'
import Database from 'better-sqlite3'
import { openDatabase } from '../../../src/main/db/runtime/connection.ts'
import { createLibraryBackup } from '../../../src/main/db/runtime/backup-service.ts'
import {
  applyPendingRestore,
  checkSpace,
  createProtectiveBackup,
  pendingRestoreIntent,
  preserveDamagedCatalog,
  protectiveBackupCause,
  publishRestoreImages,
  readBackupManifest,
  restoreBackup,
  serializeBackupManifest,
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
import type {
  BackupManifest,
  BackupStorage,
} from '../../../src/main/db/runtime/backup.ts'

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
    tag: '0001_test',
    breakpoints: true,
  })
  await writeFile(journalPath, JSON.stringify(journal))
  await writeFile(join(folder, '0001_test.sql'), sql)
  return folder
}

type Fixture = Awaited<ReturnType<typeof fixture>>

function openWorker(f: Fixture): Promise<WorkerTransport> {
  return WorkerTransport.open(f.filename, {
    workerPath: new URL(
      '../../../src/main/db/worker/entry.ts',
      import.meta.url,
    ),
    migrationsFolder,
    ...f.storage,
  })
}

// A managed immutable image referenced by the profile avatar.
async function addAvatar(
  f: Fixture,
  bytes = Buffer.from('saved immutable avatar'),
): Promise<{ id: string; path: string }> {
  await mkdir(f.storage.imagesDirectory, { recursive: true })
  const id = randomUUID()
  const path = join(f.storage.imagesDirectory, `${id}.png`)
  await writeFile(path, bytes)
  f.connection.native
    .prepare('INSERT INTO image_assets VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, `${id}.png`, 'image/png', bytes.length, 1, 1, 'ready')
  f.connection.native
    .prepare('UPDATE user_profiles SET avatar_asset_id = ?')
    .run(id)
  return { id, path }
}

interface PendingIntent {
  format: string
  version: number
  staged: string
  source: string
  createdAt: string
  bytes: number
  sha256: string
}

async function readPendingIntent(filename: string): Promise<PendingIntent> {
  const value: unknown = JSON.parse(
    await readFile(pendingRestoreIntent(filename), 'utf8'),
  )
  return value as PendingIntent
}

async function stagedFiles(filename: string): Promise<string[]> {
  return (await readdir(dirname(filename))).filter((name) =>
    name.endsWith('.restore'),
  )
}

// The catalog as another process would see it after Kiter stops.
function liveState(
  filename: string,
  sampleId: string,
): {
  favorite: number
  previewVolume: number
  avatar: string | null
  images: string[]
} {
  const live = new Database(filename, { readonly: true })
  try {
    return {
      favorite: live
        .prepare('SELECT favorite FROM samples WHERE id = ?')
        .pluck()
        .get(sampleId) as number,
      previewVolume: live
        .prepare('SELECT preview_volume FROM user_preferences')
        .pluck()
        .get() as number,
      avatar: live
        .prepare('SELECT avatar_asset_id FROM user_profiles')
        .pluck()
        .get() as string | null,
      images: live
        .prepare('SELECT storage_key FROM image_assets ORDER BY storage_key')
        .pluck()
        .all() as string[],
    }
  } finally {
    live.close()
  }
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
  assert.equal(manifest.schemaVersion, 3)
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
  assert.equal(retried.native.pragma('user_version', { simple: true }), 4)
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
  assert.equal(reopened.native.pragma('user_version', { simple: true }), 3)
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

// Every way a protective copy fails is reported with the cause that produced it,
// so a caller can tell a damaged library from a full disk without parsing a
// message. One test per cause keeps the taxonomy from collapsing back into a
// single opaque failure.
test('a protective backup reports a corrupt catalog as its own cause', async (t) => {
  const f = await fixture(t)
  f.connection.close()
  await writeFile(f.filename, 'not a database')
  // Kept open only for the call under test. Windows refuses to unlink a file with
  // a live handle, so leaking this connection turns fixture cleanup into EBUSY.
  const corrupt = new Database(f.filename)
  try {
    assert.throws(
      () =>
        createProtectiveBackup(
          corrupt,
          f.filename,
          migrationsFolder,
          f.storage,
        ),
      { code: 'BACKUP_FAILED', cause: 'catalog-corrupt' },
    )
  } finally {
    corrupt.close()
  }
})

test('a protective backup reports a readable but invalid catalog as its own cause', async (t) => {
  const f = await fixture(t)
  f.connection.native.exec('DELETE FROM user_preferences')
  assert.throws(
    () =>
      createProtectiveBackup(
        f.connection.native,
        f.filename,
        migrationsFolder,
        f.storage,
      ),
    { code: 'BACKUP_FAILED', cause: 'catalog-invalid' },
  )
  // The database is intact, so nothing was staged or published.
  assert.equal(existsSync(f.storage.backupDirectory), false)
})

test('a protective backup reports a missing referenced image as its own cause', async (t) => {
  const f = await fixture(t)
  const missing = randomUUID()
  f.connection.native
    .prepare('INSERT INTO image_assets VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(missing, `${missing}.png`, 'image/png', 1, 1, 1, 'ready')
  f.connection.native
    .prepare('UPDATE user_profiles SET avatar_asset_id = ?')
    .run(missing)
  assert.throws(
    () =>
      createProtectiveBackup(
        f.connection.native,
        f.filename,
        migrationsFolder,
        f.storage,
      ),
    { code: 'BACKUP_FAILED', cause: 'image-unavailable' },
  )
  assert.deepEqual(await readdir(f.storage.backupDirectory), [])
})

test('a protective backup reports insufficient free space as its own cause', async (t) => {
  const directory = await createTemporaryDirectory(t, 'backup')
  // A full disk cannot be produced portably, so the size guard is exercised
  // directly with a requirement no filesystem satisfies.
  let failure: unknown
  try {
    checkSpace(directory.path, Number.MAX_SAFE_INTEGER)
  } catch (error) {
    failure = error
  }
  assert.equal(protectiveBackupCause(failure), 'insufficient-space')
})

test('a protective backup reports an invalid storage directory as its own cause', async (t) => {
  const f = await fixture(t)
  await writeFile(f.storage.backupDirectory, 'not a directory')
  assert.throws(
    () =>
      createProtectiveBackup(
        f.connection.native,
        f.filename,
        migrationsFolder,
        f.storage,
      ),
    { code: 'BACKUP_FAILED', cause: 'invalid-storage' },
  )
})

test('a protective backup reports an oversized manifest as its own cause', () => {
  const image = {
    name: 'x'.repeat(120),
    bytes: 1,
    sha256: 'a'.repeat(64),
  }
  const manifest: BackupManifest = {
    format: 'kiter-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    kind: 'manual',
    schemaVersion: 3,
    catalog: { name: 'catalog.sqlite', bytes: 1, sha256: 'a'.repeat(64) },
    images: Array.from({ length: 200_000 }, () => ({ ...image })),
    verified: true,
    sidecars: [],
  }
  // A manifest of that size cannot be produced from a test catalog, so the guard
  // that bounds it is exercised directly.
  let failure: unknown
  try {
    serializeBackupManifest(manifest)
  } catch (error) {
    failure = error
  }
  assert.equal(protectiveBackupCause(failure), 'manifest-too-large')
})

// The catch-all cause is the one every untagged failure lands in, so it needs its
// own negative test: an uncapturable catalog is not a damaged library, and the
// manual surface keeps its wording while the cause travels with the error.
test('a protective backup reports an uncapturable catalog as its own cause', async (t) => {
  const f = await fixture(t)
  // VACUUM INTO cannot run inside a transaction, so the capture fails while the
  // catalog stays readable: exactly the case the catch-all cause exists for.
  f.connection.native.exec('BEGIN')
  try {
    assert.throws(
      () =>
        createLibraryBackup({
          native: f.connection.native,
          filename: f.filename,
          migrationsFolder,
          storage: f.storage,
        }),
      {
        code: 'BACKUP_FAILED',
        cause: 'capture-failed',
        message:
          'Unable to create a verified backup. The library was not changed. Retry or choose another location.',
      },
    )
  } finally {
    f.connection.native.exec('ROLLBACK')
  }
  // Nothing was staged or published for a copy that was never captured.
  assert.deepEqual(await readdir(f.storage.backupDirectory), [])
})

// S4 replaces a library whose referenced image is gone. Every other image-path
// failure is a condition to fix, so the boundary is pinned from the other side:
// an unusable image directory must keep blocking instead of making a healthy
// catalog replaceable.
test('an unusable managed image entry blocks replacement instead of counting as damage', async (t) => {
  const f = await fixture(t)
  await addAvatar(f)
  // The copy this restore applies references its own image only, so an unusable
  // entry in the current library is never touched by image publication.
  const backup = createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  const unusable = await addAvatar(
    f,
    Buffer.from('reference that cannot be copied'),
  )
  await unlink(unusable.path)
  await mkdir(unusable.path)
  f.connection.close()
  // The catalog is intact and the referenced entry is present but not a file, so
  // this is a fixable condition: replacing the library would throw away working
  // data for it, which is why it must keep blocking instead of counting as damage.
  const before = await readFile(f.filename)
  assert.throws(
    () => restoreBackup(f.filename, backup, migrationsFolder, f.storage),
    { code: 'BACKUP_FAILED', cause: 'image-invalid' },
  )
  assert.deepEqual(await readFile(f.filename), before)
  assert.deepEqual(await stagedFiles(f.filename), [])
  // Nothing was preserved, because nothing about this library is damaged.
  const folders = (await readdir(f.storage.backupDirectory)).map((name) =>
    join(f.storage.backupDirectory, name),
  )
  assert.equal(
    folders.filter((folder) => readBackupManifest(folder).kind === 'damaged')
      .length,
    0,
  )
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

test('a runtime backup command captures the catalog and only referenced images', async (t) => {
  const f = await fixture(t)
  await mkdir(f.storage.imagesDirectory, { recursive: true })
  const covered = randomUUID()
  const unreferenced = randomUUID()
  const cover = Buffer.from('saved immutable cover')
  await writeFile(join(f.storage.imagesDirectory, `${covered}.png`), cover)
  await writeFile(
    join(f.storage.imagesDirectory, `${unreferenced}.png`),
    'not referenced',
  )
  f.connection.native
    .prepare('INSERT INTO image_assets VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(covered, `${covered}.png`, 'image/png', cover.length, 1, 1, 'ready')
  f.connection.native
    .prepare('UPDATE user_profiles SET avatar_asset_id = ?')
    .run(covered)
  f.connection.close()
  const transport = await WorkerTransport.open(f.filename, {
    workerPath: new URL(
      '../../../src/main/db/worker/entry.ts',
      import.meta.url,
    ),
    migrationsFolder,
    ...f.storage,
  })
  try {
    const reply = await transport.request({ action: 'create-backup' })
    assert.equal(reply.action, 'create-backup')
    if (reply.action !== 'create-backup') {
      return
    }
    const { result } = reply
    assert.equal(result.kind, 'manual')
    assert.equal(result.totalBytes, result.catalogBytes + result.imageBytes)
    assert.equal(result.imageCount, 1)
    const manifest = verifyBackup(result.location, migrationsFolder)
    assert.equal(manifest.kind, 'manual')
    assert.equal(manifest.createdAt, result.createdAt)
    assert.deepEqual(
      manifest.images.map((image) => image.name),
      [`${covered}.png`],
    )
    // Audio and unreferenced managed images are never part of a backup.
    assert.deepEqual((await readdir(result.location)).sort(), [
      'catalog.sqlite',
      'images',
      'manifest.json',
    ])
    assert.deepEqual(await readdir(join(result.location, 'images')), [
      `${covered}.png`,
    ])
  } finally {
    await transport.close()
  }
  // Capturing saved data changes nothing in the live library.
  const live = new Database(f.filename, { readonly: true })
  try {
    assert.equal(
      live
        .prepare('SELECT favorite FROM samples WHERE id = ?')
        .pluck()
        .get(f.sample.id),
      1,
    )
    assert.equal(
      live.prepare('SELECT preview_volume FROM user_preferences').pluck().get(),
      0,
    )
    assert.equal(
      live.prepare('SELECT avatar_asset_id FROM user_profiles').pluck().get(),
      covered,
    )
  } finally {
    live.close()
  }
})

test('runtime backup listing is bounded, newest first, and counts unreadable folders', async (t) => {
  const f = await fixture(t)
  createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  // Folder names are timestamp-prefixed, so a leading digit that sorts before
  // them places this damaged entry last in newest-first order.
  const broken = join(f.storage.backupDirectory, '0000-broken')
  await mkdir(broken, { recursive: true })
  await writeFile(join(broken, 'manifest.json'), '{"format":"other"}')
  f.connection.close()
  const transport = await WorkerTransport.open(f.filename, {
    workerPath: new URL(
      '../../../src/main/db/worker/entry.ts',
      import.meta.url,
    ),
    migrationsFolder,
    ...f.storage,
  })
  try {
    const all = await transport.request({
      action: 'list-backups',
      input: {},
    })
    assert.equal(all.action, 'list-backups')
    if (all.action !== 'list-backups') {
      return
    }
    // Stored folders are counted; only readable backups are listed.
    assert.equal(all.result.total, 3)
    assert.equal(all.result.items.length, 2)
    assert.equal(all.result.skipped, 1)
    assert.equal(all.result.limit, 50)
    assert.equal(all.result.offset, 0)
    for (const item of all.result.items) {
      assert.equal(item.kind, 'pre-migration')
      verifyBackup(item.location, migrationsFolder)
    }
    const names = all.result.items.map((item) => item.location)
    assert.deepEqual(
      [...names].sort().reverse(),
      names,
      'listed copies are newest first',
    )

    const first = await transport.request({
      action: 'list-backups',
      input: { limit: 1 },
    })
    assert.equal(first.action, 'list-backups')
    if (first.action !== 'list-backups') {
      return
    }
    assert.deepEqual(
      first.result.items.map((item) => item.location),
      [names[0]],
    )
    const second = await transport.request({
      action: 'list-backups',
      input: { limit: 1, offset: 1 },
    })
    assert.equal(second.action, 'list-backups')
    if (second.action !== 'list-backups') {
      return
    }
    assert.deepEqual(
      second.result.items.map((item) => item.location),
      [names[1]],
    )
    const damaged = await transport.request({
      action: 'list-backups',
      input: { limit: 1, offset: 2 },
    })
    assert.equal(damaged.action, 'list-backups')
    if (damaged.action !== 'list-backups') {
      return
    }
    assert.deepEqual(damaged.result.items, [])
    assert.equal(damaged.result.skipped, 1)
    assert.equal(damaged.result.total, 3)
  } finally {
    await transport.close()
  }
})

test('runtime deletion removes exactly the requested managed copy and refuses anything else', async (t) => {
  const f = await fixture(t)
  const kept = createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  const removed = createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  const outside = join(dirname(f.storage.backupDirectory), 'outside-copy')
  await mkdir(outside, { recursive: true })
  await writeFile(join(outside, 'manifest.json'), '{"format":"other"}')
  const broken = join(f.storage.backupDirectory, '0000-broken')
  await mkdir(broken, { recursive: true })
  await writeFile(join(broken, 'manifest.json'), '{"format":"other"}')
  const link = join(f.storage.backupDirectory, '0001-link')
  await symlink(kept, link)
  f.connection.close()
  const transport = await WorkerTransport.open(f.filename, {
    workerPath: new URL(
      '../../../src/main/db/worker/entry.ts',
      import.meta.url,
    ),
    migrationsFolder,
    ...f.storage,
  })
  try {
    // A folder outside managed storage is never deleted, even when named.
    await assert.rejects(
      transport.request({ action: 'delete-backup', location: outside }),
      { code: 'INVALID_INPUT' },
    )
    assert.equal(existsSync(outside), true)
    // Managed storage is not enough: a folder without a readable manifest is
    // not a copy this command may remove.
    await assert.rejects(
      transport.request({ action: 'delete-backup', location: broken }),
      { code: 'UNSUPPORTED_FORMAT' },
    )
    assert.equal(existsSync(broken), true)
    // A link is refused instead of following or removing its target.
    await assert.rejects(
      transport.request({ action: 'delete-backup', location: link }),
      { code: 'INVALID_INPUT' },
    )
    assert.equal(existsSync(kept), true)

    const reply = await transport.request({
      action: 'delete-backup',
      location: removed,
    })
    assert.equal(reply.action, 'delete-backup')
    assert.equal(existsSync(removed), false)
    // Other copies are untouched and still verifiable.
    assert.equal(existsSync(kept), true)
    verifyBackup(kept, migrationsFolder)

    await assert.rejects(
      transport.request({ action: 'delete-backup', location: removed }),
      { code: 'NOT_FOUND' },
    )
  } finally {
    await transport.close()
  }
})

test('a runtime restore stages the replacement, publishes missing images and keeps the live library', async (t) => {
  const f = await fixture(t)
  const avatar = await addAvatar(f)
  const backup = createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  // The live library diverges from the copy that is about to replace it.
  setFavorite(f.connection.db, f.sample.id, false)
  setPreviewVolume(f.connection.db, 0.5)
  f.connection.native.exec(
    'UPDATE user_profiles SET avatar_asset_id = NULL; DELETE FROM image_assets;',
  )
  await unlink(avatar.path)
  f.connection.close()

  const transport = await openWorker(f)
  try {
    const reply = await transport.request({
      action: 'restore-backup',
      location: backup,
    })
    assert.equal(reply.action, 'restore-backup')
    if (reply.action !== 'restore-backup') {
      return
    }
    // The ticket names the selected copy, states that a restart applies it, and
    // never claims a completed swap.
    assert.deepEqual(reply.result, {
      location: backup,
      createdAt: verifyBackup(backup, migrationsFolder).createdAt,
      restartRequired: true,
    })
  } finally {
    await transport.close()
  }

  // Phase 1 touches nothing that is still in use.
  assert.deepEqual(liveState(f.filename, f.sample.id), {
    favorite: 0,
    previewVolume: 0.5,
    avatar: null,
    images: [],
  })
  // The immutable image the current library no longer holds is published again.
  assert.deepEqual(
    await readFile(avatar.path),
    Buffer.from('saved immutable avatar'),
  )
  // The mandatory protective copy describes the library as it is now.
  const protective = (await readdir(f.storage.backupDirectory))
    .map((entry) => ({
      folder: join(f.storage.backupDirectory, entry),
      manifest: verifyBackup(
        join(f.storage.backupDirectory, entry),
        migrationsFolder,
      ),
    }))
    .filter((entry) => entry.manifest.kind === 'pre-restoration')
  assert.equal(protective.length, 1)
  const previous = new Database(join(protective[0].folder, 'catalog.sqlite'), {
    readonly: true,
  })
  try {
    assert.equal(
      previous
        .prepare('SELECT favorite FROM samples WHERE id = ?')
        .pluck()
        .get(f.sample.id),
      0,
    )
    assert.equal(
      previous
        .prepare('SELECT preview_volume FROM user_preferences')
        .pluck()
        .get(),
      0.5,
    )
  } finally {
    previous.close()
  }
  // The replacement is staged beside the catalog and recorded, not applied.
  const intent = await readPendingIntent(f.filename)
  assert.equal(intent.format, 'kiter-restore')
  assert.equal(intent.version, 1)
  assert.equal(intent.source, backup)
  assert.equal(intent.staged, basename(intent.staged))
  assert.equal(intent.staged.startsWith('.'), true)
  assert.equal(intent.staged.endsWith('.restore'), true)
  assert.equal(Number.isFinite(Date.parse(intent.createdAt)), true)
  assert.equal(intent.bytes > 0, true)
  assert.equal(/^[a-f0-9]{64}$/.test(intent.sha256), true)
  assert.equal(existsSync(join(dirname(f.filename), intent.staged)), true)
})

test('the next start applies the staged restore and never recovers a stale WAL onto it', async (t) => {
  const f = await fixture(t)
  const avatar = await addAvatar(f)
  const backup = createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  setFavorite(f.connection.db, f.sample.id, false)
  setPreviewVolume(f.connection.db, 0.5)
  f.connection.native.exec(
    'UPDATE user_profiles SET avatar_asset_id = NULL; DELETE FROM image_assets;',
  )
  f.connection.close()

  const transport = await openWorker(f)
  try {
    const reply = await transport.request({
      action: 'restore-backup',
      location: backup,
    })
    assert.equal(reply.action, 'restore-backup')
  } finally {
    await transport.close()
  }
  // A killed session leaves real frames of the replaced catalog behind. A text
  // file is not a sidecar SQLite honours: it deletes those by itself, which would
  // let this test pass even with the sidecar cleanup removed.
  crashLeavingSidecars(f.filename, 'wal')
  assert.equal(existsSync(`${f.filename}-wal`), true)

  const restarted = await openWorker(f)
  try {
    const profile = await restarted.request({ action: 'profile' })
    assert.equal(profile.action, 'profile')
    if (profile.action !== 'profile') {
      return
    }
    assert.equal(profile.result.profile.avatarAssetId, avatar.id)
    assert.equal(profile.result.preferences.previewVolume, 0)
  } finally {
    await restarted.close()
  }
  assert.deepEqual(liveState(f.filename, f.sample.id), {
    favorite: 1,
    previewVolume: 0,
    avatar: avatar.id,
    images: [`${avatar.id}.png`],
  })
  assert.equal(existsSync(pendingRestoreIntent(f.filename)), false)
  assert.deepEqual(await stagedFiles(f.filename), [])
  assert.equal(existsSync(`${f.filename}-wal`), false)
  assert.equal(existsSync(`${f.filename}-shm`), false)
  assert.equal(crashRows(f.filename), 0)
})

test('a swap interrupted before the intent is removed is not repeated and keeps the restored catalog', async (t) => {
  const f = await fixture(t)
  const avatar = await addAvatar(f)
  const backup = createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  // The live library diverges from the restored copy, so any second swap would
  // be visible in the final state.
  setFavorite(f.connection.db, f.sample.id, false)
  setPreviewVolume(f.connection.db, 0.5)
  f.connection.native.exec(
    'UPDATE user_profiles SET avatar_asset_id = NULL; DELETE FROM image_assets;',
  )
  f.connection.close()

  const transport = await openWorker(f)
  try {
    const reply = await transport.request({
      action: 'restore-backup',
      location: backup,
    })
    assert.equal(reply.action, 'restore-backup')
  } finally {
    await transport.close()
  }
  // Simulate a crash between the rename and removing the pending intent: the
  // catalog is already the staged copy and the staged file is gone.
  const intent = await readPendingIntent(f.filename)
  await rename(join(dirname(f.filename), intent.staged), f.filename)

  const restarted = await openWorker(f)
  try {
    const profile = await restarted.request({ action: 'profile' })
    assert.equal(profile.action, 'profile')
    if (profile.action !== 'profile') {
      return
    }
    assert.equal(profile.result.profile.avatarAssetId, avatar.id)
    assert.equal(profile.result.preferences.previewVolume, 0)
  } finally {
    await restarted.close()
  }
  // The already swapped catalog is kept and the leftover intent is gone.
  assert.equal(existsSync(pendingRestoreIntent(f.filename)), false)
  assert.deepEqual(await stagedFiles(f.filename), [])
  assert.deepEqual(liveState(f.filename, f.sample.id), {
    favorite: 1,
    previewVolume: 0,
    avatar: avatar.id,
    images: [`${avatar.id}.png`],
  })
})

test('a lost staged catalog keeps the current library and removes the intent', async (t) => {
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

  const transport = await openWorker(f)
  try {
    const reply = await transport.request({
      action: 'restore-backup',
      location: backup,
    })
    assert.equal(reply.action, 'restore-backup')
  } finally {
    await transport.close()
  }
  const intent = await readPendingIntent(f.filename)
  await unlink(join(dirname(f.filename), intent.staged))

  const restarted = await openWorker(f)
  try {
    const profile = await restarted.request({ action: 'profile' })
    assert.equal(profile.action, 'profile')
    if (profile.action !== 'profile') {
      return
    }
    assert.equal(profile.result.preferences.previewVolume, 0.5)
  } finally {
    await restarted.close()
  }
  // The restore never happened, so the current library stays as it was.
  assert.deepEqual(liveState(f.filename, f.sample.id), {
    favorite: 0,
    previewVolume: 0.5,
    avatar: null,
    images: [],
  })
  assert.equal(existsSync(pendingRestoreIntent(f.filename)), false)
})

test('a second restore is refused while a replacement is pending', async (t) => {
  const f = await fixture(t)
  const first = createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  setFavorite(f.connection.db, f.sample.id, false)
  const second = createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  f.connection.close()

  const transport = await openWorker(f)
  try {
    const accepted = await transport.request({
      action: 'restore-backup',
      location: first,
    })
    assert.equal(accepted.action, 'restore-backup')
    const intentPath = pendingRestoreIntent(f.filename)
    const intent = await readFile(intentPath, 'utf8')
    const staged = await stagedFiles(f.filename)
    const copies = (await readdir(f.storage.backupDirectory)).sort()

    await assert.rejects(
      transport.request({ action: 'restore-backup', location: second }),
      { code: 'INVALID_INPUT', message: /restore is already pending/ },
    )

    // The refused request changed nothing at all.
    assert.equal(await readFile(intentPath, 'utf8'), intent)
    assert.deepEqual(await stagedFiles(f.filename), staged)
    assert.deepEqual((await readdir(f.storage.backupDirectory)).sort(), copies)
  } finally {
    await transport.close()
  }
  assert.equal(liveState(f.filename, f.sample.id).favorite, 0)
})

test('a conflicting image blocks a runtime restore and leaves no intent behind', async (t) => {
  const f = await fixture(t)
  const avatar = await addAvatar(f)
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
  await writeFile(avatar.path, 'conflicting copy')

  const transport = await openWorker(f)
  try {
    await assert.rejects(
      transport.request({ action: 'restore-backup', location: backup }),
      { code: 'DB_INTEGRITY' },
    )
  } finally {
    await transport.close()
  }
  // Immutable images are never replaced, and nothing is left staged or pending.
  assert.equal(await readFile(avatar.path, 'utf8'), 'conflicting copy')
  assert.deepEqual(liveState(f.filename, f.sample.id), {
    favorite: 1,
    previewVolume: 0,
    avatar: null,
    images: [],
  })
  assert.equal(existsSync(pendingRestoreIntent(f.filename)), false)
  assert.deepEqual(await stagedFiles(f.filename), [])
})

test('a library that cannot form a verified protective copy blocks the restore', async (t) => {
  const f = await fixture(t)
  const backup = createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  const copies = await readdir(f.storage.backupDirectory)
  f.connection.close()

  const missing = randomUUID()
  const transport = await openWorker(f)
  try {
    // The live library now references an image that managed storage lacks, so no
    // verified protective copy of it can be created.
    const live = new Database(f.filename)
    try {
      live
        .prepare('INSERT INTO image_assets VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(missing, `${missing}.png`, 'image/png', 1, 1, 1, 'ready')
      live.prepare('UPDATE user_profiles SET avatar_asset_id = ?').run(missing)
    } finally {
      live.close()
    }
    await assert.rejects(
      transport.request({ action: 'restore-backup', location: backup }),
      { code: 'BACKUP_FAILED' },
    )
  } finally {
    await transport.close()
  }
  // Current data is untouched and no replacement is pending or staged.
  assert.deepEqual(liveState(f.filename, f.sample.id), {
    favorite: 1,
    previewVolume: 0,
    avatar: missing,
    images: [`${missing}.png`],
  })
  assert.deepEqual((await readdir(f.storage.backupDirectory)).sort(), copies)
  assert.equal(existsSync(pendingRestoreIntent(f.filename)), false)
  assert.deepEqual(await stagedFiles(f.filename), [])
})

// A child that writes to the catalog and is killed, so what it leaves behind is a
// real sidecar of the file being replaced rather than an inert text file.
function crashLeavingSidecars(filename: string, mode: 'journal' | 'wal'): void {
  const setup =
    mode === 'wal'
      ? "db.pragma('journal_mode = WAL'); db.pragma('cache_size = 1')"
      : "db.pragma('cache_size = 1'); db.exec('BEGIN IMMEDIATE')"
  // In WAL mode each insert commits into the write-ahead log on its own, so the
  // kill leaves committed frames behind without an explicit COMMIT.
  const child = spawnSync(
    process.execPath,
    [
      '-e',
      `const Database = require('better-sqlite3')
       const db = new Database(process.argv[1])
       ${setup}
       const insert = db.prepare('INSERT INTO samples (id) VALUES (?)')
       for (let i = 0; i < 600; i += 1) insert.run('crash-' + i)
       process.kill(process.pid, 'SIGKILL')`,
      filename,
    ],
    { cwd: process.cwd() },
  )
  // SIGKILL does not exist on Windows: the child is terminated through
  // TerminateProcess, which reports a null signal and a non-zero exit code. Both
  // shapes prove the process died mid-write instead of exiting cleanly, which is
  // the only property this helper needs to establish.
  const killed =
    child.signal === 'SIGKILL' ||
    (process.platform === 'win32' &&
      child.signal === null &&
      typeof child.status === 'number' &&
      child.status !== 0)
  assert.ok(
    killed,
    `The crash child exited cleanly (signal ${String(child.signal)}, status ${String(child.status)}).`,
  )
}

// Opening read-write is deliberate: rolling back a hot journal needs write access,
// which is what the application itself does on the next start.
function crashRows(filename: string): number {
  const db = new Database(filename, { fileMustExist: true })
  try {
    return db
      .prepare("SELECT count(*) FROM samples WHERE id LIKE 'crash-%'")
      .pluck()
      .get() as number
  } finally {
    db.close()
  }
}

test('a hot rollback journal of the replaced catalog never reaches the restored copy', async (t) => {
  const f = await fixture(t)
  const backup = createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  // The live library diverges from the copy the user selected, so a lost restore
  // is visible in the final state.
  setFavorite(f.connection.db, f.sample.id, false)
  f.connection.close()
  const transport = await openWorker(f)
  try {
    const reply = await transport.request({
      action: 'restore-backup',
      location: backup,
    })
    assert.equal(reply.action, 'restore-backup')
  } finally {
    await transport.close()
  }
  // The session dies mid-write. This catalog runs in rollback-journal mode, so the
  // sidecar that survives belongs to the file being replaced.
  crashLeavingSidecars(f.filename, 'journal')
  assert.equal(existsSync(`${f.filename}-journal`), true)
  const restarted = await openWorker(f)
  try {
    const profile = await restarted.request({ action: 'profile' })
    assert.equal(profile.action, 'profile')
  } finally {
    await restarted.close()
  }
  // The restored catalog opened, and neither the interrupted transaction nor a
  // replayed journal reached it.
  assert.deepEqual(liveState(f.filename, f.sample.id), {
    favorite: 1,
    previewVolume: 0,
    avatar: null,
    images: [],
  })
  assert.equal(existsSync(`${f.filename}-journal`), false)
  assert.equal(crashRows(f.filename), 0)
})

test('a hostile or malformed pending intent is discarded without touching the live library', async (t) => {
  const f = await fixture(t)
  setFavorite(f.connection.db, f.sample.id, false)
  f.connection.close()
  const trap = join(f.directory, 'trap.restore')
  await writeFile(trap, 'not a catalog')
  const expected = liveState(f.filename, f.sample.id)
  const intent = (staged: string): string =>
    JSON.stringify({
      format: 'kiter-restore',
      version: 1,
      staged,
      source: trap,
      createdAt: new Date().toISOString(),
      bytes: 12,
      sha256: 'a'.repeat(64),
    })
  const intentPath = pendingRestoreIntent(f.filename)
  for (const staged of [
    '../../trap.restore',
    '..',
    trap,
    '.trap.restore',
    '.r.restore',
  ]) {
    await writeFile(intentPath, intent(staged))
    const worker = await openWorker(f)
    try {
      const profile = await worker.request({ action: 'profile' })
      assert.equal(profile.action, 'profile')
    } finally {
      await worker.close()
    }
    assert.equal(existsSync(intentPath), false, `intent removed for ${staged}`)
    assert.deepEqual(liveState(f.filename, f.sample.id), expected)
    assert.equal(await readFile(trap, 'utf8'), 'not a catalog')
  }
  // A staged entry that is a link is never followed, so its target is never read
  // as a catalog and never consumed by a swap.
  const link = join(dirname(f.filename), '.link.restore')
  await symlink(trap, link)
  await writeFile(intentPath, intent('.link.restore'))
  const worker = await openWorker(f)
  try {
    const profile = await worker.request({ action: 'profile' })
    assert.equal(profile.action, 'profile')
  } finally {
    await worker.close()
  }
  assert.equal(existsSync(intentPath), false)
  assert.deepEqual(liveState(f.filename, f.sample.id), expected)
  assert.equal(await readFile(trap, 'utf8'), 'not a catalog')
})

test(
  'a swap that cannot be renamed keeps the current catalog recoverable',
  { skip: process.platform !== 'darwin' },
  async (t) => {
    const f = await fixture(t)
    const backup = createProtectiveBackup(
      f.connection.native,
      f.filename,
      migrationsFolder,
      f.storage,
    )
    setFavorite(f.connection.db, f.sample.id, false)
    f.connection.close()
    const transport = await openWorker(f)
    try {
      const reply = await transport.request({
        action: 'restore-backup',
        location: backup,
      })
      assert.equal(reply.action, 'restore-backup')
    } finally {
      await transport.close()
    }
    // Until it is rolled back, this journal is the live library's only recovery.
    crashLeavingSidecars(f.filename, 'journal')
    assert.equal(existsSync(`${f.filename}-journal`), true)
    // The macOS "locked" flag makes the swap fail without touching any bytes.
    execFileSync('chflags', ['uchg', f.filename])
    try {
      await assert.rejects(openWorker(f), { code: 'STORAGE_FAILED' })
    } finally {
      execFileSync('chflags', ['nouchg', f.filename])
    }
    // The swap did not happen, so the recovery is still there and the intent still
    // waits for a retry instead of leaving a torn catalog behind.
    assert.equal(existsSync(`${f.filename}-journal`), true)
    assert.equal(existsSync(pendingRestoreIntent(f.filename)), true)
    assert.equal(crashRows(f.filename), 0)
    const current = new Database(f.filename, { fileMustExist: true })
    try {
      assert.equal(current.pragma('integrity_check', { simple: true }), 'ok')
      assert.equal(
        current
          .prepare('SELECT favorite FROM samples WHERE id = ?')
          .pluck()
          .get(f.sample.id),
        0,
      )
    } finally {
      current.close()
    }
  },
)

test(
  'a WAL-mode current catalog keeps its committed writes when the swap cannot be renamed',
  { skip: process.platform !== 'darwin' },
  async (t) => {
    const f = await fixture(t)
    const backup = createProtectiveBackup(
      f.connection.native,
      f.filename,
      migrationsFolder,
      f.storage,
    )
    setFavorite(f.connection.db, f.sample.id, false)
    f.connection.close()
    const transport = await openWorker(f)
    try {
      const reply = await transport.request({
        action: 'restore-backup',
        location: backup,
      })
      assert.equal(reply.action, 'restore-backup')
    } finally {
      await transport.close()
    }
    // Committed rows that only exist in the write-ahead log must not be dropped by
    // a swap that never completed.
    crashLeavingSidecars(f.filename, 'wal')
    assert.equal(existsSync(`${f.filename}-wal`), true)
    execFileSync('chflags', ['uchg', f.filename])
    try {
      await assert.rejects(openWorker(f), { code: 'STORAGE_FAILED' })
    } finally {
      execFileSync('chflags', ['nouchg', f.filename])
    }
    assert.equal(existsSync(pendingRestoreIntent(f.filename)), true)
    const current = new Database(f.filename, { fileMustExist: true })
    try {
      assert.equal(current.pragma('integrity_check', { simple: true }), 'ok')
      assert.equal(
        current
          .prepare("SELECT count(*) FROM samples WHERE id LIKE 'crash-%'")
          .pluck()
          .get(),
        600,
      )
    } finally {
      current.close()
    }
  },
)

test('a manifest naming anything but its own catalog entry is rejected', async (t) => {
  const f = await fixture(t)
  const backup = createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  const outside = join(f.directory, 'outside.db')
  await writeFile(outside, 'external bytes')
  const manifestPath = join(backup, 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  // A crafted manifest must never make the catalog entry point outside the copy.
  manifest.catalog = {
    ...manifest.catalog,
    name: join('..', '..', 'outside.db'),
  }
  await writeFile(manifestPath, JSON.stringify(manifest))
  assert.throws(() => verifyBackup(backup, migrationsFolder), {
    code: 'UNSUPPORTED_FORMAT',
  })
  assert.throws(
    () => restoreBackup(f.filename, backup, migrationsFolder, f.storage),
    { code: 'UNSUPPORTED_FORMAT' },
  )
  assert.equal(await readFile(outside, 'utf8'), 'external bytes')
  assert.deepEqual(await stagedFiles(f.filename), [])
})

test('a preserved damaged library keeps its raw catalog and sidecars and is never a restorable backup', async (t) => {
  const directory = await createTemporaryDirectory(t, 'damaged')
  const filename = join(directory.path, 'kiter.sqlite')
  const storage = {
    backupDirectory: join(directory.path, 'backups'),
    imagesDirectory: join(directory.path, 'library', 'images'),
  }
  // Bytes no verified copy could be made from, plus the sidecars a manual
  // recovery needs.
  await writeFile(filename, 'raw damaged catalog bytes')
  await writeFile(`${filename}-journal`, 'hot rollback journal')
  await writeFile(`${filename}-wal`, 'uncheckpointed frames')
  const folder = preserveDamagedCatalog(filename, storage)
  assert.deepEqual((await readdir(folder)).sort(), [
    'catalog.sqlite',
    'catalog.sqlite-journal',
    'catalog.sqlite-wal',
    'manifest.json',
  ])
  // Copied raw: VACUUM INTO is exactly what a damaged catalog cannot do.
  assert.equal(
    await readFile(join(folder, 'catalog.sqlite'), 'utf8'),
    'raw damaged catalog bytes',
  )
  assert.equal(
    await readFile(join(folder, 'catalog.sqlite-journal'), 'utf8'),
    'hot rollback journal',
  )
  const manifest = readBackupManifest(folder)
  assert.equal(manifest.kind, 'damaged')
  assert.equal(manifest.verified, false)
  assert.equal(manifest.schemaVersion, 0)
  assert.deepEqual(manifest.images, [])
  assert.deepEqual(
    manifest.sidecars.map((sidecar) => sidecar.name),
    ['catalog.sqlite-journal', 'catalog.sqlite-wal'],
  )
  // Hashes are recorded as evidence, and nothing re-verifies them.
  assert.equal(
    manifest.catalog.bytes,
    Buffer.byteLength('raw damaged catalog bytes'),
  )
  // It is marked, never accepted: no restore path may read it as a backup.
  assert.throws(() => verifyBackup(folder, migrationsFolder), {
    code: 'INVALID_INPUT',
  })
})

test('a damaged library is not replaced when its damaged state cannot be preserved', async (t) => {
  const f = await fixture(t)
  const backup = createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  f.connection.close()
  const transport = await openWorker(f)
  try {
    const reply = await transport.request({
      action: 'restore-backup',
      location: backup,
    })
    assert.equal(reply.action, 'restore-backup')
  } finally {
    await transport.close()
  }
  await writeFile(f.filename, 'not a database')
  // Managed storage that cannot receive the artifact. Preservation fails, so the
  // replacement must not happen.
  const blocked = join(f.directory, 'blocked')
  await writeFile(blocked, 'not a directory')
  assert.equal(
    applyPendingRestore(f.filename, {
      backupDirectory: blocked,
      imagesDirectory: f.storage.imagesDirectory,
    }),
    'failed',
  )
  assert.equal(await readFile(f.filename, 'utf8'), 'not a database')
  // The intent and the verified staged copy stay, so a restart retries the swap.
  assert.equal(existsSync(pendingRestoreIntent(f.filename)), true)
  assert.equal((await stagedFiles(f.filename)).length, 1)
})

test('a current library whose referenced image is gone is preserved and then replaced', async (t) => {
  const f = await fixture(t)
  const avatar = await addAvatar(f)
  const backup = createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  // The live library references an image that managed storage no longer holds, so
  // no verified protective copy of it can be created.
  await unlink(avatar.path)
  f.connection.close()
  const before = await readFile(f.filename)
  restoreBackup(f.filename, backup, migrationsFolder, f.storage)

  const folders = (await readdir(f.storage.backupDirectory)).map((name) =>
    join(f.storage.backupDirectory, name),
  )
  const preserved = folders.filter(
    (folder) => readBackupManifest(folder).kind === 'damaged',
  )
  assert.equal(preserved.length, 1)
  const artifact = readBackupManifest(preserved[0])
  assert.equal(artifact.verified, false)
  // The artifact is the pre-swap catalog byte for byte, not a VACUUM INTO of it.
  assert.equal(
    artifact.catalog.sha256,
    createHash('sha256').update(before).digest('hex'),
  )
  // The replacement still completed: the restored catalog is in place and the
  // image it references was published again.
  assert.deepEqual(liveState(f.filename, f.sample.id), {
    favorite: 1,
    previewVolume: 0,
    avatar: avatar.id,
    images: [`${avatar.id}.png`],
  })
})

test('a preserved damaged library is listed as not restorable and refused by restore', async (t) => {
  const f = await fixture(t)
  const copy = createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  f.connection.close()
  const phaseOne = await openWorker(f)
  try {
    const reply = await phaseOne.request({
      action: 'restore-backup',
      location: copy,
    })
    assert.equal(reply.action, 'restore-backup')
  } finally {
    await phaseOne.close()
  }
  await writeFile(f.filename, 'not a database')
  assert.equal(applyPendingRestore(f.filename), 'applied')

  const transport = await openWorker(f)
  try {
    const listed = await transport.request({
      action: 'list-backups',
      input: {},
    })
    assert.equal(listed.action, 'list-backups')
    if (listed.action !== 'list-backups') {
      return
    }
    const damaged = listed.result.items.find((item) => item.kind === 'damaged')
    assert.ok(damaged, 'the preserved artifact is listed, not hidden')
    // Preserving silently would be indistinguishable from deleting.
    assert.equal(damaged.restorable, false)
    assert.equal(damaged.schemaVersion, 0)
    assert.equal(damaged.imageCount, 0)
    const restorable = listed.result.items.filter(
      (item) => item.kind !== 'damaged',
    )
    assert.ok(restorable.length > 0)
    assert.ok(restorable.every((item) => item.restorable))

    await assert.rejects(
      transport.request({
        action: 'restore-backup',
        location: damaged.location,
      }),
      { code: 'INVALID_INPUT' },
    )
    // The refused request changed nothing at all.
    assert.equal(existsSync(pendingRestoreIntent(f.filename)), false)
    assert.deepEqual(await stagedFiles(f.filename), [])
  } finally {
    await transport.close()
  }
})

test('a staged restore preserves an unreadable current catalog before replacing it', async (t) => {
  const f = await fixture(t)
  const backup = createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  f.connection.close()
  const transport = await openWorker(f)
  try {
    const reply = await transport.request({
      action: 'restore-backup',
      location: backup,
    })
    assert.equal(reply.action, 'restore-backup')
  } finally {
    await transport.close()
  }
  // This is the state a restore exists for: the live catalog is unreadable.
  await writeFile(f.filename, 'not a database')
  // A journal SQLite would delete on a failed open is the only manual recovery a
  // damaged library has left, so preservation must reach it before the swap.
  await writeFile(`${f.filename}-journal`, 'hot rollback journal')
  assert.equal(applyPendingRestore(f.filename), 'applied')
  const folders = (await readdir(f.storage.backupDirectory)).map((name) =>
    join(f.storage.backupDirectory, name),
  )
  const preserved = folders.filter(
    (folder) => readBackupManifest(folder).kind === 'damaged',
  )
  assert.equal(preserved.length, 1)
  const artifact = readBackupManifest(preserved[0])
  assert.equal(artifact.verified, false)
  assert.equal(artifact.schemaVersion, 0)
  // The artifact holds the bytes that were replaced, so it was written before
  // the swap and not reconstructed from the restored catalog afterwards.
  assert.equal(
    await readFile(join(preserved[0], 'catalog.sqlite'), 'utf8'),
    'not a database',
  )
  // Verified absent as a valid backup before the swap proceeded.
  assert.throws(() => verifyBackup(preserved[0], migrationsFolder), {
    code: 'INVALID_INPUT',
  })
  // The sidecar the library could not have recovered without reached the artifact.
  assert.equal(artifact.verified, false)
  assert.equal(
    await readFile(join(preserved[0], 'catalog.sqlite-journal'), 'utf8'),
    'hot rollback journal',
  )
  assert.deepEqual(
    artifact.sidecars.map((sidecar) => sidecar.name),
    ['catalog.sqlite-journal'],
  )
  assert.equal(existsSync(`${f.filename}-journal`), false)
  assert.deepEqual(liveState(f.filename, f.sample.id), {
    favorite: 1,
    previewVolume: 0,
    avatar: null,
    images: [],
  })
  assert.equal(existsSync(pendingRestoreIntent(f.filename)), false)
})

test('a staged restore still applies when the current catalog is missing', async (t) => {
  const f = await fixture(t)
  const backup = createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  f.connection.close()
  const transport = await openWorker(f)
  try {
    const reply = await transport.request({
      action: 'restore-backup',
      location: backup,
    })
    assert.equal(reply.action, 'restore-backup')
  } finally {
    await transport.close()
  }
  const { unlink } = await import('node:fs/promises')
  await unlink(f.filename)
  assert.equal(applyPendingRestore(f.filename), 'applied')
  assert.deepEqual(liveState(f.filename, f.sample.id), {
    favorite: 1,
    previewVolume: 0,
    avatar: null,
    images: [],
  })
  assert.equal(existsSync(pendingRestoreIntent(f.filename)), false)
})

// The verifier's reproduction: a catalog truncated to nothing still carries the
// journal that is the library's only manual recovery. Preserving it must publish an
// artifact that `list-backups` can read and `delete-backup` can remove, or refuse the
// swap. An artifact nothing can read hides the last copy of what was replaced.
test('a zero-byte current catalog is preserved as a readable artifact or the swap is refused', async (t) => {
  const f = await fixture(t)
  const backup = createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  f.connection.close()
  const transport = await openWorker(f)
  try {
    const reply = await transport.request({
      action: 'restore-backup',
      location: backup,
    })
    assert.equal(reply.action, 'restore-backup')
  } finally {
    await transport.close()
  }
  const journal = Buffer.from('hot rollback journal')
  await writeFile(f.filename, '')
  await writeFile(`${f.filename}-journal`, journal)
  const outcome = applyPendingRestore(f.filename)
  if (outcome === 'failed') {
    // A blocked replacement is acceptable; an invisible artifact is not.
    assert.equal((await readFile(f.filename)).length, 0)
    assert.equal(existsSync(pendingRestoreIntent(f.filename)), true)
    return
  }
  assert.equal(outcome, 'applied')
  const folders = (await readdir(f.storage.backupDirectory)).map((name) =>
    join(f.storage.backupDirectory, name),
  )
  const preserved = folders.filter(
    (folder) => readBackupManifest(folder).kind === 'damaged',
  )
  assert.equal(preserved.length, 1)
  // The published artifact reads back even though its catalog is empty.
  const artifact = readBackupManifest(preserved[0])
  assert.equal(artifact.catalog.bytes, 0)
  assert.equal(
    artifact.catalog.sha256,
    createHash('sha256').update(Buffer.alloc(0)).digest('hex'),
  )
  assert.deepEqual(
    artifact.sidecars.map((sidecar) => sidecar.name),
    ['catalog.sqlite-journal'],
  )
  // The preserved sidecar is the exact journal the library had, digest included.
  assert.equal(
    artifact.sidecars[0].sha256,
    createHash('sha256').update(journal).digest('hex'),
  )
  assert.equal(artifact.sidecars[0].bytes, journal.length)
  assert.deepEqual(
    await readFile(join(preserved[0], 'catalog.sqlite-journal')),
    journal,
  )

  const worker = await openWorker(f)
  try {
    const listed = await worker.request({ action: 'list-backups', input: {} })
    assert.equal(listed.action, 'list-backups')
    if (listed.action !== 'list-backups') {
      return
    }
    // An unreadable artifact would be counted here and never shown.
    assert.equal(listed.result.skipped, 0)
    const item = listed.result.items.find(
      (entry) => entry.location === preserved[0],
    )
    assert.ok(item, 'the preserved artifact is listed, not skipped')
    assert.equal(item.restorable, false)
    assert.equal(item.catalogBytes, 0)
    const deleted = await worker.request({
      action: 'delete-backup',
      location: preserved[0],
    })
    assert.equal(deleted.action, 'delete-backup')
  } finally {
    await worker.close()
  }
  // Visible also means removable: the artifact is evidence, not litter.
  assert.equal(existsSync(preserved[0]), false)
})

// A valid SQLite header does not prove the body is readable, and the open that
// discovers that is what makes SQLite delete `-journal`. The sidecars are therefore
// captured before anything opens the catalog, or the artifact keeps nothing.
test('a header-valid corrupt catalog keeps its sidecars in the preserved artifact', async (t) => {
  const f = await fixture(t)
  const backup = createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  f.connection.close()
  const transport = await openWorker(f)
  try {
    const reply = await transport.request({
      action: 'restore-backup',
      location: backup,
    })
    assert.equal(reply.action, 'restore-backup')
  } finally {
    await transport.close()
  }
  // Keep the 100-byte header and destroy everything SQLite reads after it, so the
  // damage is only found by opening the catalog and reading it.
  const original = await readFile(f.filename)
  const corrupted = Buffer.from(original)
  corrupted.fill(0xff, 100)
  await writeFile(f.filename, corrupted)
  const journal = Buffer.from('hot rollback journal')
  await writeFile(`${f.filename}-journal`, journal)

  assert.equal(applyPendingRestore(f.filename), 'applied')
  const folders = (await readdir(f.storage.backupDirectory)).map((name) =>
    join(f.storage.backupDirectory, name),
  )
  const preserved = folders.filter(
    (folder) => readBackupManifest(folder).kind === 'damaged',
  )
  assert.equal(preserved.length, 1)
  const artifact = readBackupManifest(preserved[0])
  // The journal is gone from the live catalog after the failed read, which is why
  // the artifact needs a copy taken before it.
  assert.equal(existsSync(`${f.filename}-journal`), false)
  assert.deepEqual(
    artifact.sidecars.map((sidecar) => sidecar.name),
    ['catalog.sqlite-journal'],
  )
  assert.equal(
    artifact.sidecars[0].sha256,
    createHash('sha256').update(journal).digest('hex'),
  )
  assert.deepEqual(
    await readFile(join(preserved[0], 'catalog.sqlite-journal')),
    journal,
  )
  assert.deepEqual(
    await readFile(join(preserved[0], 'catalog.sqlite')),
    corrupted,
  )
})

// The startup recovery dialog reaches the swap through restoreBackup, which has to
// read the catalog to decide damage. That read happens before replaceCatalog, so the
// sidecars must be captured before it or the artifact is preserved empty.
test('the startup recovery swap preserves the journal of a header-valid corrupt catalog', async (t) => {
  const f = await fixture(t)
  const backup = createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  const original = await readFile(f.filename)
  const corrupted = Buffer.from(original)
  corrupted.fill(0xff, 100)
  f.connection.close()
  await writeFile(f.filename, corrupted)
  const journal = Buffer.from('hot rollback journal')
  await writeFile(`${f.filename}-journal`, journal)

  restoreBackup(f.filename, backup, migrationsFolder, f.storage)
  const folders = (await readdir(f.storage.backupDirectory)).map((name) =>
    join(f.storage.backupDirectory, name),
  )
  const preserved = folders.filter(
    (folder) => readBackupManifest(folder).kind === 'damaged',
  )
  assert.equal(preserved.length, 1)
  const artifact = readBackupManifest(preserved[0])
  // The startup path opened the catalog before the swap, which deleted the live
  // journal. The artifact still carries the bytes captured before that read.
  assert.equal(existsSync(`${f.filename}-journal`), false)
  assert.deepEqual(
    artifact.sidecars.map((sidecar) => sidecar.name),
    ['catalog.sqlite-journal'],
  )
  assert.equal(
    artifact.sidecars[0].sha256,
    createHash('sha256').update(journal).digest('hex'),
  )
  assert.deepEqual(
    await readFile(join(preserved[0], 'catalog.sqlite-journal')),
    journal,
  )
})

// S4 blocks replacement when the damaged state cannot be preserved. The catalog has
// already been read by then, so the journal has to be put back or the block costs the
// library its only recovery data.
test('a blocked replacement of a header-valid corrupt catalog keeps its journal', async (t) => {
  const f = await fixture(t)
  const backup = createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  const original = await readFile(f.filename)
  const corrupted = Buffer.from(original)
  corrupted.fill(0xff, 100)
  f.connection.close()
  await writeFile(f.filename, corrupted)
  const journal = Buffer.from('hot rollback journal')
  await writeFile(`${f.filename}-journal`, journal)
  // Preservation needs managed storage to publish into, so making that path a file
  // is the portable way to make it fail after the catalog was already read. The
  // source copy keeps its own directory, so verification still succeeds and the
  // failure lands where S4 says a failure blocks the swap.
  const brokenStorage = {
    ...f.storage,
    backupDirectory: join(dirname(f.filename), 'preserve-into-a-file'),
  }
  await writeFile(brokenStorage.backupDirectory, 'not a directory')

  assert.throws(
    () => restoreBackup(f.filename, backup, migrationsFolder, brokenStorage),
    { code: 'BACKUP_FAILED' },
  )
  assert.deepEqual(await readFile(f.filename), corrupted)
  assert.deepEqual(await readFile(`${f.filename}-journal`), journal)
})

// exFAT, FAT and some network volumes refuse hard links. The verified temporary copy
// is renamed into place instead, and the never-overwrite rule still holds.
test('an image is published without hard links when the filesystem refuses them', async (t) => {
  const f = await fixture(t)
  await addAvatar(f)
  const backup = createProtectiveBackup(
    f.connection.native,
    f.filename,
    migrationsFolder,
    f.storage,
  )
  const manifest = readBackupManifest(backup)
  assert.notEqual(manifest.images.length, 0)
  const fresh = join(dirname(f.storage.imagesDirectory), 'no-link-images')
  await mkdir(fresh, { recursive: true })

  publishRestoreImages(
    { ...f.storage, imagesDirectory: fresh },
    backup,
    manifest,
    () => {
      const error = new Error(
        'EXDEV: cross-device link not permitted',
      ) as NodeJS.ErrnoException
      error.code = 'EXDEV'
      throw error
    },
  )

  for (const image of manifest.images) {
    const published = await readFile(join(fresh, image.name))
    assert.equal(
      createHash('sha256').update(published).digest('hex'),
      image.sha256,
    )
  }
  assert.deepEqual(
    (await readdir(fresh)).filter((name) => name.endsWith('.tmp')),
    [],
  )
})
