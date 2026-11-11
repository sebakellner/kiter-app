import { isAbsolute } from 'node:path'
import type {
  BackupPage,
  BackupPageRequest,
  BackupSummary,
  RestoreTicket,
} from '../../../shared/domain/backup.ts'
import {
  isBackupPage,
  isBackupSummary,
  isRestoreTicket,
  requireBackupPage,
} from '../../../shared/domain/backup.ts'
import { isRecord } from '../../../shared/domain/validation.ts'

export type BackupRequest =
  | { action: 'create-backup' }
  | { action: 'list-backups'; input: BackupPageRequest }
  | { action: 'delete-backup'; location: string }
  | { action: 'restore-backup'; location: string }

export type BackupReply =
  | { action: 'create-backup'; result: BackupSummary }
  | { action: 'list-backups'; result: BackupPage }
  | { action: 'delete-backup'; result: { location: string } }
  | { action: 'restore-backup'; result: RestoreTicket }

// Deleting and restoring name an exact folder on the user's filesystem, so the
// shape check is deliberately narrower than a free-form path.
export function isBackupLocation(value: unknown): value is string {
  return typeof value === 'string' && isAbsolute(value)
}

export function isBackupRequest(value: unknown): value is BackupRequest {
  if (!isRecord(value)) {
    return false
  }
  switch (value.action) {
    case 'create-backup':
      return true
    case 'list-backups':
      try {
        requireBackupPage(value.input)
        return true
      } catch {
        return false
      }
    case 'delete-backup':
    case 'restore-backup':
      return isBackupLocation(value.location)
    default:
      return false
  }
}

export function isBackupReply(value: unknown): value is BackupReply {
  if (!isRecord(value)) {
    return false
  }
  switch (value.action) {
    case 'create-backup':
      return isBackupSummary(value.result)
    case 'list-backups':
      return isBackupPage(value.result)
    case 'delete-backup':
      return isRecord(value.result) && isBackupLocation(value.result.location)
    case 'restore-backup':
      return isRestoreTicket(value.result)
    default:
      return false
  }
}
