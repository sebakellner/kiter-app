import { lstatSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import type Database from 'better-sqlite3'
import type {
  BackupPage,
  BackupPageRequest,
  BackupSummary,
} from '../../../shared/domain/backup.ts'
import { requireBackupPage } from '../../../shared/domain/backup.ts'
import { DbError } from '../errors.ts'
import {
  backupRoot,
  createProtectiveBackup,
  readBackupManifest,
  type BackupManifest,
  type BackupStorage,
} from './backup.ts'

export interface BackupRuntime {
  native: Database.Database
  filename: string
  migrationsFolder: string
  storage: BackupStorage
}

function summarize(location: string, manifest: BackupManifest): BackupSummary {
  const imageBytes = manifest.images.reduce(
    (total, image) => total + image.bytes,
    0,
  )
  return {
    location,
    createdAt: manifest.createdAt,
    kind: manifest.kind,
    schemaVersion: manifest.schemaVersion,
    catalogBytes: manifest.catalog.bytes,
    imageBytes,
    imageCount: manifest.images.length,
    totalBytes: manifest.catalog.bytes + imageBytes,
  }
}

// Manual creation runs inside the database worker, which is the only catalog
// writer and answers one command at a time. The captured catalog is therefore
// consistent without any renderer-side write barrier; the cost is that every
// queued command waits for VACUUM INTO and the image copies.
export function createLibraryBackup(runtime: BackupRuntime): BackupSummary {
  let location: string
  try {
    location = createProtectiveBackup(
      runtime.native,
      runtime.filename,
      runtime.migrationsFolder,
      runtime.storage,
      'manual',
    )
  } catch (error) {
    // A startup failure says the library was not migrated. Nothing follows a
    // manual request, so it must not claim a migration was prevented.
    if (error instanceof DbError && error.code === 'BACKUP_FAILED') {
      throw new DbError(
        'BACKUP_FAILED',
        'Unable to create a verified backup. The library was not changed. Retry or choose another location.',
      )
    }
    throw error
  }
  // The copy was verified before publication; re-reading its own manifest keeps
  // the reply describing exactly what was published instead of re-hashing it.
  return summarize(location, readBackupManifest(location))
}

export function listLibraryBackups(
  runtime: BackupRuntime,
  input: BackupPageRequest,
): BackupPage {
  const { limit, offset } = requireBackupPage(input)
  const root = backupRoot(runtime.storage)
  // Folder names are timestamp-prefixed, so name order is age order. Only this
  // page's manifests are read: listing stays bounded however many copies exist.
  const names = readdirSync(root)
    .filter((name) => !name.startsWith('.'))
    .sort()
    .reverse()
  const items: BackupSummary[] = []
  let skipped = 0
  for (const name of names.slice(offset, offset + limit)) {
    const folder = join(root, name)
    try {
      const stats = lstatSync(folder)
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        skipped++
        continue
      }
      items.push(summarize(folder, readBackupManifest(folder)))
    } catch {
      // A stored folder that is not a readable backup is counted, never listed
      // as a copy the user could restore.
      skipped++
    }
  }
  return { items, total: names.length, limit, offset, skipped }
}

// Deletion is limited to copies this application created and manages. A path
// outside managed storage, a link, or a folder without a readable manifest is
// refused rather than removed.
export function deleteLibraryBackup(
  runtime: BackupRuntime,
  location: string,
): { location: string } {
  const root = backupRoot(runtime.storage)
  const requested = resolve(location)
  let stats
  try {
    stats = lstatSync(requested)
  } catch {
    throw new DbError('NOT_FOUND', 'That backup no longer exists.')
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new DbError('INVALID_INPUT', 'That location is not a Kiter backup.')
  }
  const target = realpathSync(requested)
  if (dirname(target) !== root || basename(target).startsWith('.')) {
    throw new DbError(
      'INVALID_INPUT',
      'That folder is not a managed Kiter backup.',
    )
  }
  readBackupManifest(target)
  rmSync(target, { recursive: true, force: false })
  return { location: target }
}
