import { dialog, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { IPC } from '../../shared/ipc'
import { requireMainFrameWindow } from './authorize'

async function handleOpenFolder(event: IpcMainInvokeEvent): Promise<string | null> {
  const owner = requireMainFrameWindow(event)
  const result = await dialog.showOpenDialog(owner, {
    properties: ['openDirectory']
  })
  if (result.canceled) return null
  const directory = result.filePaths[0]
  if (!directory) {
    console.error('Folder dialog returned no directory')
    throw new Error('The folder dialog did not return a directory. Please try again.')
  }
  return directory
}

export function registerDialogIpc(): void {
  ipcMain.handle(IPC.dialog.openFolder, handleOpenFolder)
}
