import type { BackupSummary } from '../../../shared/domain/backup.ts'
import { isBackupSummary } from '../../../shared/domain/backup.ts'
import { isRecord } from '../../../shared/domain/validation.ts'

export type BackupRequest = { action: 'create-backup' }

export type BackupReply = {
  action: 'create-backup'
  result: BackupSummary
}

export function isBackupRequest(value: unknown): value is BackupRequest {
  return isRecord(value) && value.action === 'create-backup'
}

export function isBackupReply(value: unknown): value is BackupReply {
  return (
    isRecord(value) &&
    value.action === 'create-backup' &&
    isBackupSummary(value.result)
  )
}
