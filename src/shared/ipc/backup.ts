import type {
  BackupPage,
  BackupPageRequest,
  BackupSummary,
  RestoreTicket,
} from '../domain/backup.ts'
import { DomainValidationError } from '../domain/validation.ts'
import { backupLocationSchema } from '../features/backup/schemas.ts'
import type { IpcResult } from './result.ts'

export const BACKUP_CHANNELS = {
  create: 'backup:create',
  list: 'backup:list',
  delete: 'backup:delete',
  restore: 'backup:restore',
} as const

// Deleting and restoring each act on one exact stored folder. Creation takes no
// argument: the worker owns the managed destination, so nothing renderer-supplied
// could decide where a copy lands.
export interface BackupLocationRequest {
  location: string
}

export interface BackupDeleteResult {
  location: string
}

export interface BackupApi {
  create: () => Promise<IpcResult<BackupSummary>>
  list: (request?: BackupPageRequest) => Promise<IpcResult<BackupPage>>
  delete: (
    request: BackupLocationRequest,
  ) => Promise<IpcResult<BackupDeleteResult>>
  restore: (request: BackupLocationRequest) => Promise<IpcResult<RestoreTicket>>
}

export function requireBackupLocationRequest(
  value: unknown,
): BackupLocationRequest {
  const parsed = backupLocationSchema.safeParse(value, { jitless: true })
  if (!parsed.success) {
    throw new DomainValidationError(
      'Invalid backup location. Reload the backup list before trying again.',
    )
  }
  return parsed.data
}

export function isBackupLocationResult(
  value: unknown,
): value is BackupDeleteResult {
  try {
    requireBackupLocationRequest(value)
    return true
  } catch {
    return false
  }
}

// The reply shapes are the domain's own: listing, summaries and the restore
// ticket are validated once, so the preload guard and the domain agree.
export {
  isBackupPage,
  isBackupSummary,
  isRestoreTicket,
  requireBackupPage,
} from '../domain/backup.ts'
