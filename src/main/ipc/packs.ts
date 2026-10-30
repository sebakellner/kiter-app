import { ipcMain } from 'electron'
import type { ClassificationTarget } from '../../shared/domain/classification'
import {
  PACK_CHANNELS,
  requirePackDetailRequest,
  requirePackListRequest,
  requirePackSamplesRequest,
} from '../../shared/ipc/packs'
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

  // The detail composes the reads below, so each entity list stays bounded and
  // reports its own total instead of truncating silently.
  ipcMain.handle(PACK_CHANNELS.detail, (event, request: unknown) =>
    invokeResult(
      'packs.detail',
      {
        code: 'STORAGE_FAILED',
        message: 'Unable to read the Pack. Check database storage.',
      },
      async () => {
        requireMainFrameWindow(event)
        const { id } = requirePackDetailRequest(request)
        const target: ClassificationTarget = { kind: 'pack', id }
        const pack = await database.getPackSummary(id)
        const [instruments, authors, genres] = await Promise.all([
          database.listTargetInstruments(target),
          database.listTargetAuthors(target),
          database.listTargetGenres(target),
        ])
        return { pack, instruments, authors, genres }
      },
    ),
  )

  ipcMain.handle(PACK_CHANNELS.samples, (event, request: unknown) =>
    invokeResult(
      'packs.samples',
      {
        code: 'STORAGE_FAILED',
        message: 'Unable to list Pack Samples. Check database storage.',
      },
      () => {
        requireMainFrameWindow(event)
        const { id, limit, offset } = requirePackSamplesRequest(request)
        return database.listPackSamples(id, { limit, offset })
      },
    ),
  )
}
