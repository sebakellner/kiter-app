import { ipcMain } from 'electron'
import {
  GENRE_CHANNELS,
  requireGenreListRequest,
  requireSampleGenresRequest,
  requireSampleGenresSaveRequest,
} from '../../shared/ipc/genres'
import type { DbClient } from '../db'
import { requireMainFrameWindow } from './authorize'
import { invokeResult } from './result'

export function registerGenresIpc(database: DbClient): void {
  ipcMain.handle(GENRE_CHANNELS.list, (event, request: unknown) =>
    invokeResult(
      'genres.list',
      {
        code: 'STORAGE_FAILED',
        message: 'Unable to list Genres. Check database storage.',
      },
      () => {
        requireMainFrameWindow(event)
        return database.listGenres(requireGenreListRequest(request))
      },
    ),
  )
  ipcMain.handle(GENRE_CHANNELS.readSample, (event, request: unknown) =>
    invokeResult(
      'genres.read-sample',
      {
        code: 'STORAGE_FAILED',
        message:
          'Unable to load saved genres. Retry to check database storage.',
      },
      () => {
        requireMainFrameWindow(event)
        return database.readSampleGenres(requireSampleGenresRequest(request))
      },
    ),
  )
  ipcMain.handle(GENRE_CHANNELS.saveSample, (event, request: unknown) =>
    invokeResult(
      'genres.save-sample',
      {
        code: 'STORAGE_FAILED',
        message:
          'Unable to save genres. Your draft was preserved; reload saved genres before retrying.',
      },
      () => {
        requireMainFrameWindow(event)
        return database.saveSampleGenres(
          requireSampleGenresSaveRequest(request),
        )
      },
    ),
  )
}
