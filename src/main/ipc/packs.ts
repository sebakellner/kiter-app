import { ipcMain } from 'electron'
import type { ClassificationTarget } from '../../shared/domain/classification'
import {
  PACK_CHANNELS,
  requirePackDetailRequest,
  requirePackImportCandidatesRequest,
  requirePackImportRequest,
  requirePackListRequest,
  requirePackPrepareImportRequest,
  requirePackSamplesRequest,
} from '../../shared/ipc/packs'
import type { DbClient } from '../db'
import { prepareLibraryPackImport } from '../services/library'
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

  // Preparing catalogs the folder's files before the review, exactly as the
  // internal prepackaging service already does; it registers no Pack.
  ipcMain.handle(PACK_CHANNELS.prepareImport, (event, request: unknown) =>
    invokeResult(
      'packs.prepareImport',
      {
        code: 'FOLDER_FAILED',
        message:
          'Unable to prepare the Pack import. Check folder access and database storage.',
      },
      () => {
        requireMainFrameWindow(event)
        const { directory } = requirePackPrepareImportRequest(request)
        return prepareLibraryPackImport(directory, database)
      },
    ),
  )

  ipcMain.handle(
    PACK_CHANNELS.listImportCandidates,
    (event, request: unknown) =>
      invokeResult(
        'packs.listImportCandidates',
        {
          code: 'STORAGE_FAILED',
          message:
            'Unable to list the Pack import candidates. Check database storage.',
        },
        () => {
          requireMainFrameWindow(event)
          const { sourceRootId, limit, offset } =
            requirePackImportCandidatesRequest(request)
          return database.listPackImportCandidates(sourceRootId, {
            limit,
            offset,
          })
        },
      ),
  )

  ipcMain.handle(PACK_CHANNELS.importPack, (event, request: unknown) =>
    invokeResult(
      'packs.importPack',
      {
        code: 'STORAGE_FAILED',
        message:
          'Unable to import the Pack. Review the folder again before retrying.',
      },
      () => {
        requireMainFrameWindow(event)
        return database.importPack(requirePackImportRequest(request))
      },
    ),
  )
}
