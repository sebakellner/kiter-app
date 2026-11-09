import {
  SEARCH_CHANNELS,
  requireSearchSuggestRequest,
} from '../../shared/ipc/search'
import { SEARCH_SUGGEST_FAILURE } from '../db/operations/search/handler'
import type { DbClient } from '../db'
import { handleResult } from './handler'

export function registerSearchIpc(database: DbClient): void {
  handleResult(
    SEARCH_CHANNELS.suggest,
    'search.suggest',
    SEARCH_SUGGEST_FAILURE.message,
    (request) => database.searchSuggest(requireSearchSuggestRequest(request)),
  )
}
