import {
  GENRE_CHANNELS,
  requireGenreListRequest,
  requireSampleGenresRequest,
  requireSampleGenresSaveRequest,
} from '../../shared/ipc/genres'
import type { DbClient } from '../db'
import { handleResult } from './handler'

export function registerGenresIpc(database: DbClient): void {
  handleResult(
    GENRE_CHANNELS.list,
    'genres.list',
    'Unable to list Genres. Check database storage.',
    (request) => database.listGenres(requireGenreListRequest(request)),
  )
  handleResult(
    GENRE_CHANNELS.readSample,
    'genres.read-sample',
    'Unable to load saved genres. Retry to check database storage.',
    (request) => database.readSampleGenres(requireSampleGenresRequest(request)),
  )
  handleResult(
    GENRE_CHANNELS.saveSample,
    'genres.save-sample',
    'Unable to save genres. Your draft was preserved; reload saved genres before retrying.',
    (request) =>
      database.saveSampleGenres(requireSampleGenresSaveRequest(request)),
  )
}
