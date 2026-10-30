import { dialog, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { DIALOG_CHANNELS } from '../../shared/ipc'
import type { IpcResult } from '../../shared/ipc'
import { invokeResult } from './result'
import { IpcError } from '../../shared/ipc/result'
import { requireMainFrameWindow } from './authorize'

async function handleOpenFolder(
  event: IpcMainInvokeEvent,
): Promise<string | null> {
  const owner = requireMainFrameWindow(event)
  const result = await dialog.showOpenDialog(owner, {
    properties: ['openDirectory'],
  })
  if (result.canceled) {
    return null
  }
  const directory = result.filePaths[0]
  if (!directory) {
    console.error('Folder dialog returned no directory')
    throw new IpcError(
      'DIALOG_FAILED',
      'The folder dialog did not return a directory. Please try again.',
    )
  }
  return directory
}

// A separate channel keeps the single-folder answer above unchanged for its
// callers: Pack mode needs every selected folder, in the order the user picked.
async function handleOpenFolders(event: IpcMainInvokeEvent): Promise<string[]> {
  const owner = requireMainFrameWindow(event)
  const result = await dialog.showOpenDialog(owner, {
    properties: ['openDirectory', 'multiSelections'],
  })
  if (result.canceled) {
    return []
  }
  const directories = result.filePaths
  if (
    directories.length === 0 ||
    directories.some(
      (directory) => typeof directory !== 'string' || directory.length === 0,
    )
  ) {
    console.error('Folder dialog returned no directory')
    throw new IpcError(
      'DIALOG_FAILED',
      'The folder dialog did not return a directory. Please try again.',
    )
  }
  return directories
}

export function registerDialogIpc(): void {
  ipcMain.handle(
    DIALOG_CHANNELS.openFolder,
    (event): Promise<IpcResult<string | null>> =>
      invokeResult(
        'dialog.openFolder',
        {
          code: 'DIALOG_FAILED',
          message: 'Unable to select a folder. Please try again.',
        },
        () => handleOpenFolder(event),
      ),
  )
  ipcMain.handle(
    DIALOG_CHANNELS.openFolders,
    (event): Promise<IpcResult<string[]>> =>
      invokeResult(
        'dialog.openFolders',
        {
          code: 'DIALOG_FAILED',
          message: 'Unable to select folders. Please try again.',
        },
        () => handleOpenFolders(event),
      ),
  )
}
