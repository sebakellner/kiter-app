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
  // A damaged artifact says so instead of leaving it to inference: it preserves a
  // library that could not be validated, so it is never a restorable copy.
  verified: boolean
  sidecars: BackupFile[]
}

const MANIFEST_LIMIT = 16 * 1024 * 1024

const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'latin1')

// Every failure of a protective copy is reported with the cause that produced it,
// so a caller can ask "is this library damaged?" or "is the disk full?" instead
// of matching on one opaque message. The taxonomy stays in the main process: each
// surface presents a single user-facing message, never the cause list.
export type ProtectiveBackupCause =
  // The catalog cannot be read as a database at all.
  | 'catalog-corrupt'
  // The catalog is readable but fails its stored-catalog validation.
  | 'catalog-invalid'
  // A referenced immutable image is gone and cannot be captured.
  | 'image-unavailable'
  // A managed image path exists but cannot be used: a linked or unusable image
  // directory, an entry that is not a readable regular file, or a copy that
  // failed. All of those are conditions to fix, not damage.
  | 'image-invalid'
  | 'insufficient-space'
  // The backup storage directory is not a usable directory.
  | 'invalid-storage'
  | 'manifest-too-large'
  // The catalog could not be captured, including a failed VACUUM INTO.
  | 'capture-failed'

// Thrown where the cause is still known. It is deliberately not a DbError: the
// same guards serve restore staging, where 'BACKUP_FAILED' would be wrong.
class CauseError extends Error {
  readonly cause: ProtectiveBackupCause

  constructor(cause: ProtectiveBackupCause) {
    super(`Backup failure: ${cause}`)
    this.name = 'CauseError'
    this.cause = cause
  }
}

const PROTECTIVE_BACKUP_MESSAGE =
  'Unable to create a verified protective backup. The library was not migrated or replaced. Retry or choose another backup location.'

// A protective copy failed. The message is identical for every cause because no
// caller presents the taxonomy; only the cause tells the caller what to do next.
// A surface that must word the same failure differently passes its own message and
// keeps the cause, so the taxonomy survives the re-wrap.
export class ProtectiveBackupError extends DbError {
  readonly cause: ProtectiveBackupCause

  constructor(
    cause: ProtectiveBackupCause,
    message: string = PROTECTIVE_BACKUP_MESSAGE,
  ) {
    super('BACKUP_FAILED', message)
    this.name = 'ProtectiveBackupError'
    this.cause = cause
  }
}

// The two causes S4 names as a damaged library: a catalog that cannot be read, or
// a referenced image that is gone. Only those may be replaced after their damaged
// state is preserved; every other failure keeps blocking the replacement, because
// waiting for a fix loses nothing.
export function isDamagedLibrary(
  cause: ProtectiveBackupCause | undefined,
): boolean {
  return cause === 'catalog-corrupt' || cause === 'image-unavailable'
}

export function protectiveBackupCause(
  error: unknown,
): ProtectiveBackupCause | undefined {
  if (error instanceof ProtectiveBackupError || error instanceof CauseError) {
    return error.cause
  }
  return undefined
}

// Runs one stage of a protective copy so its failure keeps the cause it happened
// for instead of collapsing into the single boundary error.
function tagged<T>(cause: ProtectiveBackupCause, run: () => T): T {
  try {
    return run()
  } catch (error) {
    throw error instanceof CauseError ? error : new CauseError(cause)
  }
}

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

function newFolderName(): string {
  return `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`
}

// `minimum` is 0 only for a damaged artifact, which preserves whatever bytes the
// broken library still had, including none.
function hashFile(path: string, minimum: number, maximum: number): BackupFile {
  if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) {
    throw new Error('Backup entries must be regular files.')
  }
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const size = fstatSync(fd).size
    if (size < minimum || size > maximum) {
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

function fingerprint(
  path: string,
  maximum = Number.MAX_SAFE_INTEGER,
): BackupFile {
  return hashFile(path, 1, maximum)
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

// Exported so the storage-size guard can be exercised without a full disk.
// Thrown through the protective-copy boundary as 'insufficient-space'.
export function checkSpace(path: string, bytes: number): void {
  const space = statfsSync(path, { bigint: true })
  if (space.bavail * space.bsize < BigInt(bytes) + 1024n * 1024n) {
    throw new CauseError('insufficient-space')
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
  const isFile = (entry: unknown, allowEmpty = false): entry is BackupFile =>
    isRecord(entry) &&
    typeof entry.name === 'string' &&
    typeof entry.bytes === 'number' &&
    Number.isSafeInteger(entry.bytes) &&
    entry.bytes >= (allowEmpty ? 0 : 1) &&
    typeof entry.sha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(entry.sha256)
  const isSidecar = (entry: unknown): entry is BackupFile =>
    isFile(entry, true) &&
    /^catalog\.sqlite-(journal|wal|shm)$/.test(entry.name)
  // Every restorable copy carries a catalog. Damaged evidence records whatever
  // bytes the broken library still had, and a catalog truncated to zero bytes is
  // exactly when its sidecars are the whole of the recovery.
  if (!isRecord(value) || !isBackupKind(value.kind)) {
    throw new DbError(
      'UNSUPPORTED_FORMAT',
      'This is not a supported Kiter backup.',
    )
  }
  // A damaged artifact is unverified by definition, and only a damaged artifact
  // may be. Both directions matter: an artifact can never be read as a valid copy,
  // and a valid copy can never be read as damaged evidence.
  const verified = value.verified === undefined ? true : value.verified
  const sidecars = value.sidecars === undefined ? [] : value.sidecars
  const damaged = value.kind === 'damaged'
  if (
    value.format !== 'kiter-backup' ||
    value.version !== 1 ||
    typeof value.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    typeof verified !== 'boolean' ||
    (verified === false) !== damaged ||
    typeof value.schemaVersion !== 'number' ||
    !Number.isSafeInteger(value.schemaVersion) ||
    (damaged ? value.schemaVersion !== 0 : value.schemaVersion < 1) ||
    !isFile(value.catalog, damaged) ||
    value.catalog.name !== 'catalog.sqlite' ||
    !Array.isArray(value.images) ||
    !value.images.every(
      (image) =>
        isFile(image) &&
        validImageName(image.name) &&
        image.bytes <= IMAGE_MAX_BYTES,
    ) ||
    new Set(value.images.map((image) => image.name)).size !==
      value.images.length ||
    // Damaged evidence never claims verified image coverage.
    (damaged && value.images.length !== 0) ||
    !Array.isArray(sidecars) ||
    !sidecars.every(isSidecar) ||
    new Set(sidecars.map((sidecar) => sidecar.name)).size !== sidecars.length ||
    (!damaged && sidecars.length !== 0)
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
    verified,
    sidecars,
  }
}

// Exported because a manifest over the supported size cannot be produced from a
// test catalog, so the guard that bounds it is exercised directly.
export function serializeBackupManifest(manifest: BackupManifest): string {
  const json = JSON.stringify(manifest, null, 2)
  if (Buffer.byteLength(json) > MANIFEST_LIMIT) {
    throw new CauseError('manifest-too-large')
  }
  return json
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
  if (manifest.kind === 'damaged') {
    // A preserved damaged library is evidence for manual recovery, never a copy
    // this command may accept.
    throw new DbError(
      'INVALID_INPUT',
      'That folder preserves a damaged library and cannot be restored.',
    )
  }
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

// A catalog that cannot be read cannot be copied. Corruption is separated from a
// readable catalog that fails stored validation, because only the first one leaves
// the sidecars as the library's only recovery.
function readCurrentCatalog(
  native: Database.Database,
  migrationsFolder: string,
): ReturnType<typeof inspectMigrations> {
  try {
    validateStoredCatalog(native)
    return inspectMigrations(native, migrationsFolder)
  } catch (error) {
    const code = isRecord(error) ? error.code : undefined
    throw new CauseError(
      code === 'SQLITE_CORRUPT' || code === 'SQLITE_NOTADB'
        ? 'catalog-corrupt'
        : 'catalog-invalid',
    )
  }
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
    const history = readCurrentCatalog(native, migrationsFolder)
    const locations = storageFor(filename, storage)
    const root = tagged('invalid-storage', () =>
      directory(locations.backupDirectory),
    )
    const id = newFolderName()
    const folder = join(root, `.${id}.pending`)
    staging = folder
    mkdirSync(folder)
    mkdirSync(join(folder, 'images'))
    const images = referencedImages(native).map(({ storage_key: name }) => {
      if (!validImageName(name)) {
        throw new CauseError('image-invalid')
      }
      for (const path of [
        dirname(locations.imagesDirectory),
        locations.imagesDirectory,
      ]) {
        // A directory that is not there yet holds no image; the entry lookup below
        // decides whether a referenced one is missing.
        if (!existsSync(path)) {
          continue
        }
        if (
          !lstatSync(path).isDirectory() ||
          lstatSync(path).isSymbolicLink()
        ) {
          throw new CauseError('image-invalid')
        }
      }
      const path = join(locations.imagesDirectory, name)
      try {
        lstatSync(path)
      } catch (error) {
        // S4 replaces a library whose referenced image is gone. Anything else that
        // only prevents the lookup, a denied directory for example, is a condition
        // to fix, so it keeps blocking instead of making a healthy catalog
        // replaceable.
        throw new CauseError(
          isRecord(error) && error.code === 'ENOENT'
            ? 'image-unavailable'
            : 'image-invalid',
        )
      }
      const info = tagged('image-invalid', () =>
        fingerprint(path, IMAGE_MAX_BYTES),
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
    const catalogPath = join(folder, 'catalog.sqlite')
    tagged('capture-failed', () => {
      native.prepare('VACUUM INTO ?').run(catalogPath)
    })
    syncFile(catalogPath)
    for (const image of images) {
      const target = join(folder, 'images', image.name)
      // The bytes were fingerprinted a moment ago, so a failure here is a copy that
      // could not be made, never evidence that the image is gone.
      tagged('image-invalid', () => {
        copyFileSync(
          join(locations.imagesDirectory, image.name),
          target,
          constants.COPYFILE_EXCL,
        )
        syncFile(target)
        verifyFile(target, image, IMAGE_MAX_BYTES)
      })
    }
    const manifest: BackupManifest = {
      format: 'kiter-backup',
      version: 1,
      createdAt: new Date().toISOString(),
      kind,
      schemaVersion: history.version,
      catalog: { ...fingerprint(catalogPath), name: 'catalog.sqlite' },
      images,
      verified: true,
      sidecars: [],
    }
    writeFileSync(
      join(folder, 'manifest.json'),
      serializeBackupManifest(manifest),
      {
        flag: 'wx',
      },
    )
    syncFile(join(folder, 'manifest.json'))
    verifyBackup(folder, migrationsFolder)
    syncDirectory(join(folder, 'images'))
    syncDirectory(folder)
    const published = join(root, id)
    renameSync(folder, published)
    staging = undefined
    syncDirectory(root)
    return published
  } catch (error) {
    throw new ProtectiveBackupError(
      error instanceof CauseError ? error.cause : 'capture-failed',
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

const SIDECAR_SUFFIXES = ['-journal', '-wal', '-shm'] as const

interface SidecarEntry {
  // Name inside a damaged artifact.
  name: string
  // Suffix SQLite appends to the catalog file.
  suffix: string
  // Where the bytes currently are: the live catalog, or a snapshot of it.
  path: string
  bytes: number
}

interface SidecarSnapshot {
  folder: string
  entries: SidecarEntry[]
}

// The sidecars are the only manual recovery a damaged library has left, so they are
// collected from the live catalog in one place instead of per caller.
function sidecarFiles(filename: string): SidecarEntry[] {
  return SIDECAR_SUFFIXES.flatMap((suffix) => {
    const path = `${filename}${suffix}`
    if (!existsSync(path)) {
      return []
    }
    const stats = lstatSync(path)
    if (stats.isSymbolicLink() || !stats.isFile()) {
      return []
    }
    return [
      { name: `catalog.sqlite${suffix}`, suffix, path, bytes: stats.size },
    ]
  })
}

// SQLite deletes `-journal` and `-wal` when it opens a catalog it cannot read, and
// a valid header does not prove the body is readable. The sidecars are therefore
// copied into staging before anything opens the catalog, and those copies are what
// a damaged artifact keeps. A clean settle discards them.
function stageSidecarSnapshot(filename: string): SidecarSnapshot | undefined {
  const live = sidecarFiles(filename)
  if (live.length === 0) {
    return undefined
  }
  const folder = join(dirname(filename), `.${randomUUID()}.sidecars`)
  mkdirSync(folder)
  try {
    const entries = live.map((sidecar) => {
      const target = join(folder, sidecar.name)
      copyFileSync(sidecar.path, target, constants.COPYFILE_EXCL)
      return { ...sidecar, path: target }
    })
    return { folder, entries }
  } catch (error) {
    rmSync(folder, { recursive: true, force: true })
    throw error
  }
}

// A settle that could not read the catalog may already have deleted the live
// sidecars. When nothing preserved them, they go back exactly as they were: a
// manual recovery still finds them, and nothing that exists again is overwritten.
function restoreSidecarSnapshot(
  filename: string,
  snapshot: SidecarSnapshot,
): void {
  for (const sidecar of snapshot.entries) {
    try {
      copyFileSync(
        sidecar.path,
        `${filename}${sidecar.suffix}`,
        constants.COPYFILE_EXCL,
      )
    } catch {
      console.error('Sidecar recovery failed:', 'STORAGE_FAILED')
    }
  }
}

// A damaged library cannot form a verified copy, so its raw catalog and the
// sidecars SQLite would use to recover it are preserved as evidence instead. The
// catalog is never opened, never vacuumed and never re-verified: the artifact
// declares `kind: 'damaged'` and `verified: false`, and every restore path refuses
// it. A failure here is thrown so the caller blocks the replacement. `snapshot`
// holds sidecar bytes copied before anything opened the catalog; without it the
// live sidecars are used.
export function preserveDamagedCatalog(
  filename: string,
  storage?: BackupStorage,
  snapshot?: SidecarSnapshot,
): string {
  let staging: string | undefined
  try {
    const current = lstatSync(filename)
    // Damaged evidence is never gathered through a link or from a non-file.
    if (current.isSymbolicLink() || !current.isFile()) {
      throw new CauseError('invalid-storage')
    }
    const root = directory(storageFor(filename, storage).backupDirectory)
    const sidecars = snapshot?.entries ?? sidecarFiles(filename)
    checkSpace(
      root,
      current.size +
        sidecars.reduce((total, sidecar) => total + sidecar.bytes, 0),
    )
    const id = newFolderName()
    const folder = join(root, `.${id}.pending`)
    staging = folder
    mkdirSync(folder)
    const catalogPath = join(folder, 'catalog.sqlite')
    // Raw bytes only: VACUUM INTO is exactly what a damaged catalog cannot do.
    copyFileSync(filename, catalogPath, constants.COPYFILE_EXCL)
    syncFile(catalogPath)
    const manifest: BackupManifest = {
      format: 'kiter-backup',
      version: 1,
      createdAt: new Date().toISOString(),
      kind: 'damaged',
      // Nothing could read the catalog, so there is no version to report.
      schemaVersion: 0,
      verified: false,
      catalog: {
        ...hashFile(catalogPath, 0, Number.MAX_SAFE_INTEGER),
        name: 'catalog.sqlite',
      },
      images: [],
      sidecars: sidecars.map(({ name, path }) => {
        const target = join(folder, name)
        copyFileSync(path, target, constants.COPYFILE_EXCL)
        syncFile(target)
        // Recorded as evidence of what was kept. Nothing re-verifies it later.
        return { ...hashFile(target, 0, Number.MAX_SAFE_INTEGER), name }
      }),
    }
    writeFileSync(
      join(folder, 'manifest.json'),
      serializeBackupManifest(manifest),
      { flag: 'wx' },
    )
    syncFile(join(folder, 'manifest.json'))
    // A zero-byte catalog is legitimate evidence when the sidecars carry the
    // recovery, so the artifact has to read back before it is published. An
    // artifact that nothing can list or delete hides the only copy of the library
    // the replacement is about to discard, which is worse than blocking the swap.
    readBackupManifest(folder)
    syncDirectory(folder)
    const published = join(root, id)
    renameSync(folder, published)
    staging = undefined
    syncDirectory(root)
    return published
  } catch {
    // Replacement depends on this artifact, so a failure blocks it.
    throw new DbError(
      'BACKUP_FAILED',
      'Unable to preserve the damaged library, so it was not replaced. Retry or choose another backup location.',
    )
  } finally {
    if (staging) {
      try {
        rmSync(staging, { recursive: true, force: true })
      } catch {
        console.error('Unpublished artifact cleanup failed:', 'STORAGE_FAILED')
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
// Hard links publish an immutable image atomically: the bytes already exist,
// verified and flushed, under a temporary name, and linking refuses to overwrite.
// A filesystem without them (exFAT, FAT, some network volumes) refuses with EXDEV or
// EPERM, and there the verified temporary copy is renamed into place instead. The
// rule is unchanged either way: a partial copy never becomes a managed image.
function isUnsupportedLink(error: unknown): boolean {
  const code = isRecord(error) ? error.code : undefined
  return (
    code === 'EXDEV' ||
    code === 'EPERM' ||
    code === 'ENOTSUP' ||
    code === 'EMLINK' ||
    code === 'EACCES'
  )
}

export function publishRestoreImages(
  storage: BackupStorage,
  folder: string,
  manifest: BackupManifest,
  // Test seam: the non-hard-link branch cannot be reached on demand, because every
  // CI filesystem supports links inside one directory. Defaults to the real call.
  link: (from: string, to: string) => void = linkSync,
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
      try {
        link(temporary, target)
      } catch (error) {
        if (!isUnsupportedLink(error)) {
          throw error
        }
        // Renaming would replace an existing destination, which the link never
        // does, so this branch copies exclusively instead: an image already
        // published by another attempt is never overwritten, whatever its bytes.
        // The copy is verified again under its final name, and a copy that fails
        // verification is removed rather than left as a managed image.
        copyFileSync(temporary, target, constants.COPYFILE_EXCL)
        try {
          syncFile(target)
          verifyFile(target, image, IMAGE_MAX_BYTES)
        } catch (verification) {
          rmSync(target, { force: true })
          throw verification
        }
      }
    } finally {
      if (existsSync(temporary)) {
        unlinkSync(temporary)
      }
    }
  }
  syncDirectory(imagesDirectory)
}

// A file that does not carry the SQLite header can never be opened as a database,
// and SQLite deletes `-journal` and `-wal` when that open fails. Those sidecars are
// a damaged library's only manual recovery, so damage is decided from the bytes
// before anything opens the catalog.
function hasCatalogHeader(path: string): boolean {
  try {
    const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    try {
      const header = Buffer.alloc(SQLITE_HEADER.length)
      readSync(fd, header, 0, header.length, 0)
      return header.equals(SQLITE_HEADER)
    } finally {
      closeSync(fd)
    }
  } catch {
    return false
  }
}

// The catalog runs in SQLite's rollback-journal mode, so a killed session can
// leave a hot `-journal` describing pages that were only half written. Opening
// and closing the file does nothing: the journal is rolled back on the first
// access to the database, so an actual read is required. A write-ahead log is
// checkpointed explicitly for the same reason, because closing the last
// connection does not reliably do it.
//
// Three outcomes must stay distinct. 'absent' has nothing to keep. 'damaged' is a
// catalog that cannot be read at all, so the caller must preserve it instead of
// keeping it. Recovery that is merely blocked, by a read-only file or another
// connection, throws: the sidecars are then still this library's only rollback.
function settleCatalog(filename: string): 'absent' | 'settled' | 'damaged' {
  if (!existsSync(filename)) {
    return 'absent'
  }
  if (!hasCatalogHeader(filename)) {
    return 'damaged'
  }
  const current = new Database(filename)
  try {
    try {
      current.prepare('SELECT count(*) FROM sqlite_master').pluck().get()
    } catch (error) {
      const code = isRecord(error) ? error.code : undefined
      if (code === 'SQLITE_NOTADB' || code === 'SQLITE_CORRUPT') {
        return 'damaged'
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
    return 'settled'
  } finally {
    current.close()
  }
}

// The sidecars describe the file being replaced, so they are removed after it is
// settled and before the rename, never after: renaming first would let SQLite
// replay foreign frames onto the restored catalog. A library that could not form a
// verified copy is preserved here, before those sidecars are removed, and a failed
// preservation throws instead of replacing what was never kept.
//
// Damage can only be decided by opening the catalog, and that open is what deletes
// the sidecars of a file it cannot read. They are copied first, so the artifact
// holds the recovery the library had before the swap tried anything.
function replaceCatalog(
  filename: string,
  staged: string,
  options: {
    storage?: BackupStorage
    currentDamaged?: boolean
    /** Sidecars captured before anything opened the catalog. See prepareCurrentLibrary. */
    snapshot?: SidecarSnapshot
  } = {},
): void {
  // Startup recovery already had to read the catalog to decide damage, and that
  // read deletes the sidecars of a file it cannot read. It brings its own
  // snapshot so the bytes captured before the read are the ones preserved.
  const snapshot = options.snapshot ?? stageSidecarSnapshot(filename)
  let settled: 'absent' | 'settled' | 'damaged' = 'absent'
  let published = false
  try {
    settled = settleCatalog(filename)
    if (
      settled === 'damaged' ||
      (settled === 'settled' && options.currentDamaged === true)
    ) {
      preserveDamagedCatalog(filename, options.storage, snapshot)
      published = true
    }
  } finally {
    if (snapshot) {
      // The swap did not keep these bytes anywhere, so they go back where a manual
      // recovery looks for them instead of disappearing with the snapshot.
      if (settled === 'damaged' && !published) {
        restoreSidecarSnapshot(filename, snapshot)
      }
      rmSync(snapshot.folder, { recursive: true, force: true })
    }
  }
  for (const suffix of SIDECAR_SUFFIXES) {
    rmSync(`${filename}${suffix}`, { force: true })
  }
  renameSync(staged, filename)
  syncDirectory(dirname(filename))
}

// The current library always receives a verified protective copy first. Returns
// whether that copy could be made. A damaged library cannot form one, so the
// caller goes on to replace it and the swap preserves its damaged state instead;
// every other failure keeps blocking the replacement.
interface PreparedLibrary {
  /** True when the current library formed a verified protective copy. */
  verified: boolean
  /** Sidecars captured before anything opened the catalog, when it is damaged. */
  snapshot?: SidecarSnapshot
}

function prepareCurrentLibrary(
  filename: string,
  migrationsFolder: string,
  storage: BackupStorage | undefined,
): PreparedLibrary {
  // The sidecars are copied before the first open, not after: deciding damage
  // requires reading the catalog, and that read deletes the `-journal` of a file
  // it cannot read. Copying afterwards would preserve an empty artifact.
  const snapshot = stageSidecarSnapshot(filename)
  let current: Database.Database | undefined
  try {
    // A file without the SQLite header is never opened for verification.
    if (existsSync(filename) && !hasCatalogHeader(filename)) {
      return { verified: false, snapshot }
    }
    current = new Database(filename, { fileMustExist: true })
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
    // Nothing needs preserving: this catalog is being replaced deliberately, so
    // the swap removes its sidecars and the captured copy is just staging.
    if (snapshot) {
      rmSync(snapshot.folder, { recursive: true, force: true })
    }
    return { verified: true }
  } catch (error) {
    if (isDamagedLibrary(protectiveBackupCause(error))) {
      return { verified: false, snapshot }
    }
    if (snapshot) {
      rmSync(snapshot.folder, { recursive: true, force: true })
    }
    throw error
  } finally {
    current?.close()
  }
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
  const prepared = prepareCurrentLibrary(filename, migrationsFolder, storage)
  try {
    const staged = stageRestoreCatalog(filename, folder, manifest)
    try {
      // Immutable images are in place before the single atomic catalog replacement.
      // Interrupted staging leaves the current catalog and its images usable.
      publishRestoreImages(locations, folder, manifest)
      replaceCatalog(filename, staged, {
        storage,
        currentDamaged: !prepared.verified,
        snapshot: prepared.snapshot,
      })
    } finally {
      rmSync(staged, { force: true })
    }
  } finally {
    // replaceCatalog removes the snapshot it used; this covers the paths that
    // never reached it, so a failed staging leaves no captured copy behind.
    if (prepared.snapshot) {
      rmSync(prepared.snapshot.folder, { recursive: true, force: true })
    }
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

export function applyPendingRestore(
  filename: string,
  storage?: BackupStorage,
): PendingRestoreOutcome {
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
      replaceCatalog(filename, staged, { storage })
    } catch (error) {
      // The intent stays so a restart can retry the same verified swap.
      console.error(
        'Pending restore could not be applied:',
        error instanceof DbError ? error.code : 'STORAGE_FAILED',
      )
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
