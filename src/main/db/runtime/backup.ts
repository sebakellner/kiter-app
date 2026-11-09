import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  renameSync,
  rmSync,
  statfsSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { isEntityId, isRecord } from '../../../shared/domain/validation.ts'
import type { BackupKind } from '../../../shared/domain/backup.ts'
import { isBackupKind } from '../../../shared/domain/backup.ts'
import { IMAGE_MAX_BYTES } from '../../../shared/domain/imageAsset.ts'
import { DbError } from '../errors.ts'
import { inspectMigrations } from './migrate.ts'
import { validateStoredCatalog } from './validate.ts'

export interface BackupStorage {
  backupDirectory: string
  imagesDirectory: string
}

interface BackupFile {
  name: string
  bytes: number
  sha256: string
}

export interface BackupManifest {
  format: 'kiter-backup'
  version: 1
  createdAt: string
  kind: BackupKind
  schemaVersion: number
  catalog: BackupFile
  images: BackupFile[]
}

const MANIFEST_LIMIT = 16 * 1024 * 1024

// A restore intent is written at runtime and applied by the next bootstrap. It
// is a request, never authority: bootstrap re-validates its shape, that the
// staged catalog is a direct child of the catalog directory, and its bytes.
interface PendingRestore {
  format: 'kiter-restore'
  version: 1
  staged: string
  source: string
  createdAt: string
  bytes: number
  sha256: string
}

const PENDING_RESTORE = '.restore-pending.json'

function storageFor(filename: string, storage?: BackupStorage): BackupStorage {
  return (
    storage ?? {
      backupDirectory: join(dirname(filename), 'backups'),
      imagesDirectory: join(dirname(filename), '..', 'library', 'images'),
    }
  )
}

// userData may itself have a system alias (for example /var on macOS).
// Resolve its existing parent once; reject links inside managed storage.
function directory(path: string): string {
  const absolute = resolve(path)
  if (!existsSync(absolute)) {
    const parent = directory(dirname(absolute))
    mkdirSync(join(parent, basename(absolute)))
  }
  if (
    !lstatSync(absolute).isDirectory() ||
    lstatSync(absolute).isSymbolicLink()
  ) {
    throw new Error('Invalid backup storage directory.')
  }
  return realpathSync(absolute)
}

function fingerprint(
  path: string,
  maximum = Number.MAX_SAFE_INTEGER,
): BackupFile {
  if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) {
    throw new Error('Backup entries must be regular files.')
  }
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const size = fstatSync(fd).size
    if (size < 1 || size > maximum) {
      throw new Error('Invalid backup entry size.')
    }
    const hash = createHash('sha256')
    const buffer = Buffer.alloc(64 * 1024)
    let count: number
    while ((count = readSync(fd, buffer)) > 0) {
      hash.update(buffer.subarray(0, count))
    }
    return { name: '', bytes: size, sha256: hash.digest('hex') }
  } finally {
    closeSync(fd)
  }
}

function syncFile(path: string): void {
  const fd = openSync(path, 'r+')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

function syncDirectory(path: string): void {
  // Node cannot open directories for fsync on Windows. Individual files are
  // flushed there; rename/link durability still needs packaged-platform checks.
  if (process.platform === 'win32') {
    return
  }
  const fd = openSync(path, 'r')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

function checkSpace(path: string, bytes: number): void {
  const space = statfsSync(path, { bigint: true })
  if (space.bavail * space.bsize < BigInt(bytes) + 1024n * 1024n) {
    throw new Error('Insufficient storage space.')
  }
}

function referencedImages(
  native: Database.Database,
): Array<{ storage_key: string }> {
  return native
    .prepare<[], { storage_key: string }>(
      `
    SELECT storage_key FROM image_assets WHERE id IN (
      SELECT avatar_asset_id FROM user_profiles WHERE avatar_asset_id IS NOT NULL
      UNION SELECT cover_asset_id FROM packs WHERE cover_asset_id IS NOT NULL
      UNION SELECT cover_asset_id FROM collections WHERE cover_asset_id IS NOT NULL
    ) ORDER BY storage_key
  `,
    )
    .all()
}

function validImageName(name: string): boolean {
  const match = /^(.*)\.(png|jpg|webp)$/.exec(name)
  return match !== null && isEntityId(match[1])
}

export function readBackupManifest(folder: string): BackupManifest {
  const filename = join(folder, 'manifest.json')
  fingerprint(filename, MANIFEST_LIMIT)
  const value: unknown = JSON.parse(readFileSync(filename, 'utf8'))
  const isFile = (entry: unknown): entry is BackupFile =>
    isRecord(entry) &&
    typeof entry.name === 'string' &&
    typeof entry.bytes === 'number' &&
    Number.isSafeInteger(entry.bytes) &&
    entry.bytes > 0 &&
    typeof entry.sha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(entry.sha256)
  if (
    !isRecord(value) ||
    value.format !== 'kiter-backup' ||
    value.version !== 1 ||
    typeof value.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !isBackupKind(value.kind) ||
    typeof value.schemaVersion !== 'number' ||
    !Number.isSafeInteger(value.schemaVersion) ||
    value.schemaVersion < 1 ||
    !isFile(value.catalog) ||
    value.catalog.name !== 'catalog.sqlite' ||
    !Array.isArray(value.images) ||
    !value.images.every(
      (image) =>
        isFile(image) &&
        validImageName(image.name) &&
        image.bytes <= IMAGE_MAX_BYTES,
    ) ||
    new Set(value.images.map((image) => image.name)).size !==
      value.images.length
  ) {
    throw new DbError(
      'UNSUPPORTED_FORMAT',
      'This is not a supported Kiter backup.',
    )
  }
  return {
    format: value.format,
    version: value.version,
    createdAt: value.createdAt,
    kind: value.kind,
    schemaVersion: value.schemaVersion,
    catalog: value.catalog,
    images: value.images,
  }
}

function verifyFile(
  path: string,
  expected: BackupFile,
  maximum?: number,
): void {
  const actual = fingerprint(path, maximum)
  if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
    throw new DbError(
      'DB_INTEGRITY',
      'The backup is incomplete or has changed.',
    )
  }
}

// Managed backup storage is the only place this application creates or removes
// copies, so callers never resolve it themselves.
export function backupRoot(storage: BackupStorage): string {
  return directory(storage.backupDirectory)
}

export function verifyBackup(
  folder: string,
  migrationsFolder: string,
): BackupManifest {
  if (!lstatSync(folder).isDirectory() || lstatSync(folder).isSymbolicLink()) {
    throw new Error('Invalid backup directory.')
  }
  const manifest = readBackupManifest(folder)
  verifyFile(join(folder, manifest.catalog.name), manifest.catalog)
  const catalog = new Database(join(folder, manifest.catalog.name), {
    readonly: true,
    fileMustExist: true,
  })
  try {
    const history = inspectMigrations(catalog, migrationsFolder)
    if (history.fresh || history.version !== manifest.schemaVersion) {
      throw new DbError(
        'DB_INTEGRITY',
        'The backup catalog version is invalid.',
      )
    }
    validateStoredCatalog(catalog)
    const expected = referencedImages(catalog).map((image) => image.storage_key)
    if (
      JSON.stringify(expected) !==
      JSON.stringify(manifest.images.map((image) => image.name))
    ) {
      throw new DbError(
        'DB_INTEGRITY',
        'The backup image references are incomplete.',
      )
    }
  } finally {
    catalog.close()
  }
  if (
    manifest.images.length > 0 &&
    (!lstatSync(join(folder, 'images')).isDirectory() ||
      lstatSync(join(folder, 'images')).isSymbolicLink())
  ) {
    throw new Error('Invalid backup image directory.')
  }
  for (const image of manifest.images) {
    verifyFile(join(folder, 'images', image.name), image, IMAGE_MAX_BYTES)
  }
  return manifest
}

// Startup-only: no command handlers, image publication/cleanup, or background
// writers exist until this finishes. VACUUM INTO includes committed WAL data.
export function createProtectiveBackup(
  native: Database.Database,
  filename: string,
  migrationsFolder: string,
  storage?: BackupStorage,
  kind: BackupKind = 'pre-migration',
): string {
  let staging: string | undefined
  try {
    validateStoredCatalog(native)
    const history = inspectMigrations(native, migrationsFolder)
    const locations = storageFor(filename, storage)
    const root = directory(locations.backupDirectory)
    const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`
    staging = join(root, `.${id}.pending`)
    mkdirSync(staging)
    mkdirSync(join(staging, 'images'))
    const images = referencedImages(native).map(({ storage_key: name }) => {
      if (!validImageName(name)) {
        throw new Error('Invalid managed image identity.')
      }
      for (const path of [
        dirname(locations.imagesDirectory),
        locations.imagesDirectory,
      ]) {
        if (
          !lstatSync(path).isDirectory() ||
          lstatSync(path).isSymbolicLink()
        ) {
          throw new Error('Invalid managed image directory.')
        }
      }
      const info = fingerprint(
        join(locations.imagesDirectory, name),
        IMAGE_MAX_BYTES,
      )
      return { ...info, name }
    })
    const pageCount: unknown = native.pragma('page_count', { simple: true })
    const pageSize: unknown = native.pragma('page_size', { simple: true })
    if (
      typeof pageCount !== 'number' ||
      typeof pageSize !== 'number' ||
      !Number.isSafeInteger(pageCount * pageSize)
    ) {
      throw new Error('Invalid catalog storage size.')
    }
    checkSpace(
      root,
      pageCount * pageSize +
        images.reduce((total, image) => total + image.bytes, 0),
    )
    const catalogPath = join(staging, 'catalog.sqlite')
    native.prepare('VACUUM INTO ?').run(catalogPath)
    syncFile(catalogPath)
    for (const image of images) {
      const target = join(staging, 'images', image.name)
      copyFileSync(
        join(locations.imagesDirectory, image.name),
        target,
        constants.COPYFILE_EXCL,
      )
      syncFile(target)
      verifyFile(target, image, IMAGE_MAX_BYTES)
    }
    const manifest: BackupManifest = {
      format: 'kiter-backup',
      version: 1,
      createdAt: new Date().toISOString(),
      kind,
      schemaVersion: history.version,
      catalog: { ...fingerprint(catalogPath), name: 'catalog.sqlite' },
      images,
    }
    const json = JSON.stringify(manifest, null, 2)
    if (Buffer.byteLength(json) > MANIFEST_LIMIT) {
      throw new Error('Backup manifest exceeds its supported size.')
    }
    writeFileSync(join(staging, 'manifest.json'), json, { flag: 'wx' })
    syncFile(join(staging, 'manifest.json'))
    verifyBackup(staging, migrationsFolder)
    syncDirectory(join(staging, 'images'))
    syncDirectory(staging)
    const published = join(root, id)
    renameSync(staging, published)
    staging = undefined
    syncDirectory(root)
    return published
  } catch {
    throw new DbError(
      'BACKUP_FAILED',
      'Unable to create a verified protective backup. The library was not migrated or replaced. Retry or choose another backup location.',
    )
  } finally {
    if (staging) {
      // Only remove the unpublished directory created by this attempt.
      try {
        rmSync(staging, { recursive: true, force: true })
      } catch {
        console.error('Unpublished backup cleanup failed:', 'STORAGE_FAILED')
      }
    }
  }
}

// Managed image storage is resolved once here so both restore phases publish
// into the same verified directory.
function managedImages(locations: BackupStorage): string {
  const imagesDirectory = directory(locations.imagesDirectory)
  if (lstatSync(dirname(locations.imagesDirectory)).isSymbolicLink()) {
    throw new Error('Invalid managed image parent directory.')
  }
  return imagesDirectory
}

// The staged catalog is a uniquely named sibling of the catalog file, so the
// replacement itself is a rename inside one directory. Callers own the staged
// file: only they know whether it is still meant to be published or applied.
export function stageRestoreCatalog(
  filename: string,
  folder: string,
  manifest: BackupManifest,
): string {
  // The catalog entry name comes from the manifest, which is untrusted input.
  // Verification already rejects any other name, but this is where the source
  // path is built, so the invariant is enforced here instead of a module away.
  if (manifest.catalog.name !== 'catalog.sqlite') {
    throw new Error('Unexpected catalog entry in the backup manifest.')
  }
  checkSpace(dirname(filename), manifest.catalog.bytes)
  const staged = join(dirname(filename), `.${randomUUID()}.restore`)
  try {
    copyFileSync(
      join(folder, manifest.catalog.name),
      staged,
      constants.COPYFILE_EXCL,
    )
    verifyFile(staged, manifest.catalog)
    syncFile(staged)
    return staged
  } catch (error) {
    // This attempt owns the staged file; a partial copy is never kept.
    rmSync(staged, { force: true })
    throw error
  }
}

// Immutable images are never overwritten. An existing file with different bytes
// blocks the replacement, and a missing one is copied under a temporary name,
// verified, and linked into place so a partial copy never becomes a managed
// image. Published images are additive and harmless if the restore stops later.
export function publishRestoreImages(
  storage: BackupStorage,
  folder: string,
  manifest: BackupManifest,
): void {
  const imagesDirectory = managedImages(storage)
  checkSpace(
    imagesDirectory,
    manifest.images.reduce((sum, image) => sum + image.bytes, 0),
  )
  for (const image of manifest.images) {
    const target = join(imagesDirectory, image.name)
    if (existsSync(target)) {
      verifyFile(target, image, IMAGE_MAX_BYTES)
      continue
    }
    const temporary = join(imagesDirectory, `${randomUUID()}.tmp`)
    try {
      copyFileSync(
        join(folder, 'images', image.name),
        temporary,
        constants.COPYFILE_EXCL,
      )
      verifyFile(temporary, image, IMAGE_MAX_BYTES)
      syncFile(temporary)
      linkSync(temporary, target)
    } finally {
      if (existsSync(temporary)) {
        unlinkSync(temporary)
      }
    }
  }
  syncDirectory(imagesDirectory)
}

// The catalog runs in SQLite's rollback-journal mode, so a killed session can
// leave a hot `-journal` describing pages that were only half written. Opening
// and closing the file does nothing: the journal is rolled back on the first
// access to the database, so an actual read is required. A write-ahead log is
// checkpointed explicitly for the same reason, because closing the last
// connection does not reliably do it.
//
// Two outcomes must stay distinct. A catalog that is absent, or that is not a
// database at all, cannot be kept: the caller is replacing it with a verified
// copy, so it is settled as unrecoverable and the swap goes ahead. Recovery that
// is merely blocked, by a read-only file or another connection, must abort
// instead, because the sidecars are still this library's only rollback.
function settleCatalog(filename: string): void {
  if (!existsSync(filename)) {
    return
  }
  const current = new Database(filename)
  try {
    try {
      current.prepare('SELECT count(*) FROM sqlite_master').pluck().get()
    } catch (error) {
      const code = isRecord(error) ? error.code : undefined
      if (code === 'SQLITE_NOTADB' || code === 'SQLITE_CORRUPT') {
        return
      }
      throw error
    }
    const checkpoint = current.pragma('wal_checkpoint(TRUNCATE)')
    // A busy checkpoint leaves committed frames in the log, so deleting the
    // sidecars afterwards would drop them from a library the caller keeps.
    if (
      Array.isArray(checkpoint) &&
      checkpoint.some((row) => isRecord(row) && Boolean(row.busy))
    ) {
      throw new Error('The current catalog could not be checkpointed.')
    }
  } finally {
    current.close()
  }
}

// The sidecars describe the file being replaced, so they are removed after it is
// settled and before the rename, never after: renaming first would let SQLite
// replay foreign frames onto the restored catalog.
function replaceCatalog(filename: string, staged: string): void {
  settleCatalog(filename)
  for (const suffix of ['-journal', '-wal', '-shm']) {
    rmSync(`${filename}${suffix}`, { force: true })
  }
  renameSync(staged, filename)
  syncDirectory(dirname(filename))
}

// Startup-only: the catalog is closed before replacement, so its journal mode
// can be reset here. The runtime restore cannot do this while the app is live and
// does not need to; its swap happens at bootstrap through replaceCatalog.
export function restoreBackup(
  filename: string,
  folder: string,
  migrationsFolder: string,
  storage?: BackupStorage,
): void {
  const manifest = verifyBackup(folder, migrationsFolder)
  const locations = storageFor(filename, storage)
  // A valid current library always receives a verified protective backup first.
  // Corrupt catalogs are deliberately not replaceable in this first slice.
  const current = new Database(filename, { fileMustExist: true })
  try {
    createProtectiveBackup(
      current,
      filename,
      migrationsFolder,
      storage,
      'pre-restoration',
    )
    current.pragma('wal_checkpoint(TRUNCATE)')
    if (
      current.pragma('journal_mode = DELETE', { simple: true }) !== 'delete'
    ) {
      throw new Error('Unable to prepare the current library for replacement.')
    }
  } finally {
    current.close()
  }
  const staged = stageRestoreCatalog(filename, folder, manifest)
  try {
    // Immutable images are in place before the single atomic catalog replacement.
    // Interrupted staging leaves the current catalog and its images usable.
    publishRestoreImages(locations, folder, manifest)
    replaceCatalog(filename, staged)
  } finally {
    rmSync(staged, { force: true })
  }
}

// The intent is a sibling of the catalog file so the next bootstrap of the same
// library finds it without any renderer state.
export function pendingRestoreIntent(filename: string): string {
  return join(dirname(filename), PENDING_RESTORE)
}

// Only the staged basename is persisted: a path outside the catalog directory
// is never recorded, so bootstrap never has to trust an arbitrary location.
export function writePendingRestore(
  filename: string,
  source: string,
  staged: string,
): void {
  const catalog = fingerprint(staged)
  const intent: PendingRestore = {
    format: 'kiter-restore',
    version: 1,
    staged: basename(staged),
    source,
    createdAt: new Date().toISOString(),
    bytes: catalog.bytes,
    sha256: catalog.sha256,
  }
  const path = pendingRestoreIntent(filename)
  writeFileSync(path, JSON.stringify(intent, null, 2), { flag: 'wx' })
  syncFile(path)
  syncDirectory(dirname(filename))
}

function readPendingRestore(path: string): PendingRestore {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (
    !isRecord(value) ||
    value.format !== 'kiter-restore' ||
    value.version !== 1 ||
    typeof value.staged !== 'string' ||
    // A basename only: no absolute path, no parent directory, no other shape.
    basename(value.staged) !== value.staged ||
    !value.staged.startsWith('.') ||
    !value.staged.endsWith('.restore') ||
    typeof value.source !== 'string' ||
    !isAbsolute(value.source) ||
    typeof value.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    typeof value.bytes !== 'number' ||
    !Number.isSafeInteger(value.bytes) ||
    value.bytes < 1 ||
    typeof value.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.sha256)
  ) {
    throw new Error('Invalid pending restore intent.')
  }
  return {
    format: value.format,
    version: value.version,
    staged: value.staged,
    source: value.source,
    createdAt: value.createdAt,
    bytes: value.bytes,
    sha256: value.sha256,
  }
}

function digest(path: string): BackupFile | undefined {
  try {
    return fingerprint(path)
  } catch {
    return undefined
  }
}

// Bootstrap entry point: complete the catalog swap a runtime restore staged, then
// let the normal open path migrate and validate the result. This returns an
// outcome instead of throwing, because an unusable intent must never brick
// startup, but a swap that could not be applied has to stop it: continuing would
// serve a session whose writes the next start silently discards.
export type PendingRestoreOutcome =
  'none' | 'applied' | 'discarded' | 'skipped' | 'failed'

export function applyPendingRestore(filename: string): PendingRestoreOutcome {
  const intentPath = pendingRestoreIntent(filename)
  if (!existsSync(intentPath)) {
    return 'none'
  }
  let intent: PendingRestore
  try {
    intent = readPendingRestore(intentPath)
  } catch {
    rmSync(intentPath, { force: true })
    console.error('Discarded invalid pending restore:', 'INVALID_INPUT')
    return 'discarded'
  }
  const directoryPath = dirname(resolve(filename))
  const staged = join(directoryPath, intent.staged)
  if (dirname(staged) !== directoryPath) {
    rmSync(intentPath, { force: true })
    console.error(
      'Discarded pending restore outside the catalog directory:',
      'INVALID_INPUT',
    )
    return 'discarded'
  }
  if (existsSync(staged)) {
    const stats = lstatSync(staged)
    if (stats.isSymbolicLink() || !stats.isFile()) {
      // A link is never followed and an unexpected entry is never removed.
      rmSync(intentPath, { force: true })
      console.error(
        'Discarded pending restore with an invalid staged catalog:',
        'INVALID_INPUT',
      )
      return 'discarded'
    }
    const actual = digest(staged)
    if (
      !actual ||
      actual.bytes !== intent.bytes ||
      actual.sha256 !== intent.sha256
    ) {
      // The staged copy no longer matches the intent, so it is not the verified
      // catalog this intent describes. Neither it nor the intent is trusted.
      rmSync(staged, { force: true })
      rmSync(intentPath, { force: true })
      console.error(
        'Discarded pending restore with a changed catalog:',
        'DB_INTEGRITY',
      )
      return 'discarded'
    }
    try {
      replaceCatalog(filename, staged)
    } catch {
      // The intent stays so a restart can retry the same verified swap.
      console.error('Pending restore could not be applied:', 'STORAGE_FAILED')
      return 'failed'
    }
    rmSync(intentPath, { force: true })
    // The swap is not yet a working restore: the catalog still has to open, which
    // is the caller's next step.
    console.error('Pending restore swapped the catalog:', 'RESTORE_SWAP')
    return 'applied'
  }
  const current = digest(filename)
  rmSync(intentPath, { force: true })
  if (
    current &&
    current.bytes === intent.bytes &&
    current.sha256 === intent.sha256
  ) {
    // The swap already happened and only the cleanup was interrupted.
    console.error('Pending restore was already applied:', 'RESTORE_SWAP')
    return 'applied'
  }
  // The staged copy is gone and the catalog is not the restored one, so the
  // restore never happened. The current library stays as it is.
  console.error('Pending restore kept the current library:', 'RESTORE_SKIPPED')
  return 'skipped'
}
