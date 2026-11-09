import type { Page, PageRequest } from './pagination.ts'
import { MAX_PAGE_LIMIT, requirePage } from './pagination.ts'
import { isRecord } from './validation.ts'

// A backup kind states why the copy exists, never whether it is valid. Validity
// is established only by verifying the copy itself.
export type BackupKind = 'pre-migration' | 'pre-restoration' | 'manual'

export interface BackupSummary {
  location: string
  createdAt: string
  kind: BackupKind
  schemaVersion: number
  catalogBytes: number
  imageBytes: number
  imageCount: number
  totalBytes: number
}

// Stored folders on this page that are not readable backups. They are counted
// instead of listed, so a damaged entry is visible without being presented as a
// copy the user can restore.
export interface BackupPage extends Page<BackupSummary> {
  skipped: number
}

export type BackupPageRequest = PageRequest

// A restore completes the catalog swap on the next start, so the runtime reply
// only confirms which stored copy was prepared and when that copy was created.
// It never claims the library has already been replaced.
export interface RestoreTicket {
  location: string
  createdAt: string
}

// Every surface that offers backup creation must state this limitation: a copy
// kept on the same disk does not survive losing that disk.
export const BACKUP_LOCAL_LIMITATION =
  'Backups stay on this computer. Keep a second copy somewhere else to survive a disk failure.'

export function requireBackupPage(value: unknown): Required<BackupPageRequest> {
  return requirePage(value, 'Invalid backup page request.')
}

const kinds: readonly BackupKind[] = [
  'pre-migration',
  'pre-restoration',
  'manual',
]

function isByteCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function isBackupKind(value: unknown): value is BackupKind {
  return kinds.some((kind) => kind === value)
}

export function isBackupSummary(value: unknown): value is BackupSummary {
  return (
    isRecord(value) &&
    typeof value.location === 'string' &&
    value.location.length > 0 &&
    typeof value.createdAt === 'string' &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    isBackupKind(value.kind) &&
    typeof value.schemaVersion === 'number' &&
    Number.isSafeInteger(value.schemaVersion) &&
    value.schemaVersion >= 1 &&
    isByteCount(value.catalogBytes) &&
    isByteCount(value.imageBytes) &&
    isByteCount(value.imageCount) &&
    isByteCount(value.totalBytes) &&
    value.totalBytes === value.catalogBytes + value.imageBytes &&
    // A copy without a catalog is not a backup.
    value.catalogBytes > 0
  )
}

export function isRestoreTicket(value: unknown): value is RestoreTicket {
  return (
    isRecord(value) &&
    typeof value.location === 'string' &&
    value.location.length > 0 &&
    typeof value.createdAt === 'string' &&
    Number.isFinite(Date.parse(value.createdAt))
  )
}

export function isBackupPage(value: unknown): value is BackupPage {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isBackupSummary) &&
    isByteCount(value.total) &&
    isByteCount(value.offset) &&
    typeof value.limit === 'number' &&
    Number.isSafeInteger(value.limit) &&
    value.limit >= 1 &&
    value.limit <= MAX_PAGE_LIMIT &&
    isByteCount(value.skipped) &&
    // A page never reports more entries than it could hold.
    value.items.length + value.skipped <= value.limit &&
    value.items.length <= Math.max(0, value.total - value.offset)
  )
}
