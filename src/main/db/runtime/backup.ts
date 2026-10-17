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
import { basename, dirname, join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { isEntityId, isRecord } from '../../../shared/domain/validation.ts'
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

interface BackupManifest {
  format: 'kiter-backup'
  version: 1
  createdAt: string
  kind: 'pre-migration' | 'pre-restoration'
  schemaVersion: number
  catalog: BackupFile
  images: BackupFile[]
}

const MANIFEST_LIMIT = 16 * 1024 * 1024

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

function readManifest(folder: string): BackupManifest {
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
    (value.kind !== 'pre-migration' && value.kind !== 'pre-restoration') ||
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

export function verifyBackup(
  folder: string,
  migrationsFolder: string,
): BackupManifest {
  if (!lstatSync(folder).isDirectory() || lstatSync(folder).isSymbolicLink()) {
    throw new Error('Invalid backup directory.')
  }
  const manifest = readManifest(folder)
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
  kind: BackupManifest['kind'] = 'pre-migration',
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
  const imagesDirectory = directory(locations.imagesDirectory)
  if (lstatSync(dirname(locations.imagesDirectory)).isSymbolicLink()) {
    throw new Error('Invalid managed image parent directory.')
  }
  checkSpace(dirname(filename), manifest.catalog.bytes)
  checkSpace(
    imagesDirectory,
    manifest.images.reduce((sum, image) => sum + image.bytes, 0),
  )
  const stagedCatalog = join(dirname(filename), `.${randomUUID()}.restore`)
  try {
    copyFileSync(
      join(folder, 'catalog.sqlite'),
      stagedCatalog,
      constants.COPYFILE_EXCL,
    )
    verifyFile(stagedCatalog, manifest.catalog)
    syncFile(stagedCatalog)
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
    // Immutable images are in place before the single atomic catalog replacement.
    // Interrupted staging leaves the current catalog and its images usable.
    syncDirectory(imagesDirectory)
    renameSync(stagedCatalog, filename)
    syncDirectory(dirname(filename))
  } finally {
    if (existsSync(stagedCatalog)) {
      unlinkSync(stagedCatalog)
    }
  }
}
