import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'

export function registerDialogIpc(): void {
  ipcMain.handle(IPC.dialog.openFolder, async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options = { properties: ['openDirectory' as const] }
    const r = await (owner ? dialog.showOpenDialog(owner, options) : dialog.showOpenDialog(options))
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })
}
