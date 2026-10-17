import { dialog } from 'electron'
import { join } from 'node:path'
import { constants } from 'node:fs'
import { open, lstat } from 'node:fs/promises'
import { DbClient } from './db'
import { isRecord } from '../shared/domain/validation'

async function backupSummary(folder: string): Promise<string> {
  const path = join(folder, 'manifest.json')
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink() || info.size > 16 * 1024 * 1024) {
    throw new Error('Invalid backup manifest.')
  }
  const handle = await open(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  )
  try {
    const value: unknown = JSON.parse(await handle.readFile('utf8'))
    if (
      !isRecord(value) ||
      value.format !== 'kiter-backup' ||
      value.version !== 1 ||
      typeof value.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(value.createdAt))
    ) {
      throw new Error('Unsupported backup manifest.')
    }
    // Descriptive metadata only; the worker validates all hashes, references,
    // catalog integrity and compatibility before touching the current library.
    return `Backup date: ${new Date(value.createdAt).toLocaleString()}`
  } finally {
    await handle.close()
  }
}

export async function openLibrary(userData: string): Promise<DbClient | null> {
  const filename = join(userData, 'db', 'kiter.sqlite')
  let backupDirectory = join(userData, 'db', 'backups')
  let restoreFrom: string | undefined
  while (true) {
    try {
      return await DbClient.open(filename, {
        backupDirectory,
        imagesDirectory: join(userData, 'library', 'images'),
        restoreFrom,
      })
    } catch (error) {
      restoreFrom = undefined
      const code =
        error instanceof Error && 'code' in error
          ? error.code
          : 'STORAGE_FAILED'
      const result = await dialog.showMessageBox({
        type: 'error',
        title: 'Unable to open the library',
        message:
          code === 'BACKUP_FAILED'
            ? 'Kiter could not create a verified protective backup.'
            : 'Kiter could not open the local library.',
        detail:
          'Existing data has not been reset. Retry, choose another location for protective backups, or restore a compatible backup. Backups include saved catalog data and referenced covers/avatar, but not original audio. Local backups do not protect against disk loss. Restoration replaces the library and first requires a verified backup of the current data; damaged libraries cannot yet be restored here.',
        buttons: ['Retry', 'Choose backup location', 'Restore backup', 'Quit'],
        defaultId: 0,
        cancelId: 3,
        noLink: true,
      })
      if (result.response === 3) {
        return null
      }
      if (result.response === 1) {
        const selection = await dialog.showOpenDialog({
          title: 'Choose protective backup storage',
          properties: ['openDirectory', 'createDirectory'],
        })
        if (!selection.canceled && selection.filePaths[0]) {
          backupDirectory = selection.filePaths[0]
        }
      }
      if (result.response === 2) {
        const selection = await dialog.showOpenDialog({
          title: 'Select a Kiter backup folder containing manifest.json',
          properties: ['openDirectory'],
        })
        if (selection.canceled || !selection.filePaths[0]) {
          continue
        }
        let summary: string
        try {
          summary = await backupSummary(selection.filePaths[0])
        } catch {
          dialog.showErrorBox(
            'Invalid backup',
            'Select a supported Kiter backup folder containing manifest.json. The current library has not been replaced.',
          )
          continue
        }
        const review = await dialog.showMessageBox({
          type: 'warning',
          title: 'Restore library backup',
          message: 'Replace the current library with this backup?',
          detail: `${selection.filePaths[0]}\n${summary}\n\nKiter will verify the backup and preserve a protective copy of the current library before replacement. Saved organization, favorites, profile and preferences will be replaced. Original audio is not included or modified. Preview will not start automatically.`,
          buttons: ['Cancel', 'Restore library'],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        })
        if (review.response === 1) {
          restoreFrom = selection.filePaths[0]
        }
      }
    }
  }
}
