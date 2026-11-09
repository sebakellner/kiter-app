import type { ClientRequest } from './core.ts'
import type { BackupSummary } from '../../../shared/domain/backup.ts'

export interface BackupsCommands {
  createBackup(): Promise<BackupSummary>
}

export function backupsCommands(request: ClientRequest): BackupsCommands {
  return {
    async createBackup(): Promise<BackupSummary> {
      return request({ action: 'create-backup' })
    },
  }
}
