import { ipcMain } from 'electron'
import { PACK_CHANNELS, requirePackListRequest } from '../../shared/ipc/packs'
import type { DbClient } from '../db'
import { requireMainFrameWindow } from './authorize'
import { invokeResult } from './result'

export function registerPacksIpc(database: DbClient): void {
  ipcMain.handle(PACK_CHANNELS.list, (event, request: unknown) =>
    invokeResult(
      'packs.list',
      {
        code: 'STORAGE_FAILED',
        message: 'Unable to list Packs. Check database storage.',
      },
      () => {
        requireMainFrameWindow(event)
        return database.listPacks(requirePackListRequest(request))
      },
    ),
  )
}
