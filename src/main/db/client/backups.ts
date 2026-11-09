import type { ClientRequest } from './core.ts'
import type {
  BackupPage,
  BackupPageRequest,
  BackupSummary,
} from '../../../shared/domain/backup.ts'

export interface BackupsCommands {
  createBackup(): Promise<BackupSummary>
  listBackups(input?: BackupPageRequest): Promise<BackupPage>
  deleteBackup(location: string): Promise<{ location: string }>
}

export function backupsCommands(request: ClientRequest): BackupsCommands {
  return {
    async createBackup(): Promise<BackupSummary> {
      return request({ action: 'create-backup' })
    },

    async listBackups(input: BackupPageRequest = {}): Promise<BackupPage> {
      return request({ action: 'list-backups', input })
    },

    async deleteBackup(location: string): Promise<{ location: string }> {
      return request({ action: 'delete-backup', location })
    },
  }
}
