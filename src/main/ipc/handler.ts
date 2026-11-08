import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { invokeResult } from './result.ts'
import { requireMainFrameWindow } from './authorize.ts'

// Registers an authorized handler with one storage failure policy: the caller
// supplies only the operation name and the message a failure shows.
export function handleResult<T>(
  channel: string,
  operation: string,
  failureMessage: string,
  work: (request: unknown, window: BrowserWindow) => T | Promise<T>,
): void {
  ipcMain.handle(channel, (event, request: unknown) =>
    invokeResult<T>(
      operation,
      { code: 'STORAGE_FAILED', message: failureMessage },
      () => work(request, requireMainFrameWindow(event)),
    ),
  )
}
