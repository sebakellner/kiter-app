import { BrowserWindow } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'

export function requireMainFrameWindow(event: IpcMainEvent | IpcMainInvokeEvent): BrowserWindow {
  if (event.sender.isDestroyed()) throw new Error('Unauthorized IPC request')
  const owner = BrowserWindow.fromWebContents(event.sender)
  if (!owner || event.senderFrame !== event.sender.mainFrame) {
    throw new Error('Unauthorized IPC request')
  }
  return owner
}
