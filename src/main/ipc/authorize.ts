import { BrowserWindow } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import { IpcError } from '../../shared/ipc/result'

export function requireMainFrameWindow(event: IpcMainEvent | IpcMainInvokeEvent): BrowserWindow {
  if (event.sender.isDestroyed()) throw new IpcError('UNAUTHORIZED', 'Unauthorized IPC request')
  const owner = BrowserWindow.fromWebContents(event.sender)
  if (!owner || event.senderFrame !== event.sender.mainFrame) {
    throw new IpcError('UNAUTHORIZED', 'Unauthorized IPC request')
  }
  return owner
}
