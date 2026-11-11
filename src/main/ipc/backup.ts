import { requireBackupPage } from '../../shared/domain/backup'
import {
  BACKUP_CHANNELS,
  requireBackupLocationRequest,
} from '../../shared/ipc/backup'
import type { DbClient } from '../db'
import { handleResult } from './handler'

// Backup commands own the catalog file and managed storage, so they reach the
// worker instead of catalog dispatch. Creation and restore both report that the
// library was not changed when they fail, because neither of them swaps anything:
// restore only stages the replacement for the next start.
export function registerBackupIpc(database: DbClient): void {
  handleResult(
    BACKUP_CHANNELS.create,
    'backup.create',
    'Unable to create a backup. The library was not changed; check storage access and available disk space.',
    () => database.createBackup(),
  )
  handleResult(
    BACKUP_CHANNELS.list,
    'backup.list',
    'Unable to load backups. Retry to check database storage.',
    (request) => database.listBackups(requireBackupPage(request)),
  )
  handleResult(
    BACKUP_CHANNELS.delete,
    'backup.delete',
    'Unable to delete the backup. Reload the backup list before trying again.',
    (request) =>
      database.deleteBackup(requireBackupLocationRequest(request).location),
  )
  handleResult(
    BACKUP_CHANNELS.restore,
    'backup.restore',
    'Unable to prepare the restore. The library was not changed; check storage access and available disk space.',
    (request) =>
      database.restoreBackup(requireBackupLocationRequest(request).location),
  )
}
