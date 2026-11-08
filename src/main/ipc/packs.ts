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
import { handleResult } from './handler'
import { requireMainFrameWindow } from './authorize'
import { invokeResult } from './result'

export function registerPacksIpc(database: DbClient): void {
  handleResult(
    PACK_CHANNELS.list,
    'packs.list',
    'Unable to list Packs. Check database storage.',
    (request) => database.listPacks(requirePackListRequest(request)),
  )

  // The detail composes the reads below, so each entity list stays bounded and
  // reports its own total instead of truncating silently.
  handleResult(
    PACK_CHANNELS.detail,
    'packs.detail',
    'Unable to read the Pack. Check database storage.',
    async (request) => {
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
  )

  handleResult(
    PACK_CHANNELS.samples,
    'packs.samples',
    'Unable to list Pack Samples. Check database storage.',
    (request) => {
      const { id, limit, offset } = requirePackSamplesRequest(request)
      return database.listPackSamples(id, { limit, offset })
    },
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

  handleResult(
    PACK_CHANNELS.listImportCandidates,
    'packs.listImportCandidates',
    'Unable to list the Pack import candidates. Check database storage.',
    (request) => {
      const { sourceRootId, limit, offset } =
        requirePackImportCandidatesRequest(request)
      return database.listPackImportCandidates(sourceRootId, { limit, offset })
    },
  )

  handleResult(
    PACK_CHANNELS.importPack,
    'packs.importPack',
    'Unable to import the Pack. Review the folder again before retrying.',
    (request) => database.importPack(requirePackImportRequest(request)),
  )
}
