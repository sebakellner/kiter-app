import { dialog, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { DIALOG_CHANNELS } from '../../shared/ipc'
import type { IpcResult } from '../../shared/ipc'
import { invokeResult } from './result'
import { IpcError } from '../../shared/ipc/result'
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
    throw new IpcError(
      'DIALOG_FAILED',
      'The folder dialog did not return a directory. Please try again.'
    )
  }
  return directory
}

export function registerDialogIpc(): void {
  ipcMain.handle(DIALOG_CHANNELS.openFolder, (event): Promise<IpcResult<string | null>> =>
    invokeResult(
      'dialog.openFolder',
      {
        code: 'DIALOG_FAILED',
        message: 'Unable to select a folder. Please try again.'
      },
      () => handleOpenFolder(event)
    )
  )
}
