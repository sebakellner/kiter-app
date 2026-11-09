import { invokeResult } from '../../../ipc/result.ts'
import type { IpcResult } from '../../../../shared/ipc/result.ts'
import {
  requireSearchSuggestRequest,
  type SearchSuggestRequest,
  type SearchSuggestResponse,
} from '../../../../shared/ipc/search.ts'

/** The failure `search:suggest` reports, shaped like `library:list`. */
export const SEARCH_SUGGEST_FAILURE = {
  code: 'STORAGE_FAILED',
  message: 'Unable to search. Check database storage and try again.',
} as const

/**
 * The `search:suggest` request path: validate the request, run the bounded
 * operation and report failures with one storage policy.
 *
 * `ipc/search.ts` registers the same work through `handleResult`, which applies
 * this policy to `database.searchSuggest`. The core lives here because
 * `node:test` cannot import Electron, so the observable request behavior is
 * covered through it.
 */
export function searchSuggestResult(
  suggest: (
    input: SearchSuggestRequest,
  ) => SearchSuggestResponse | Promise<SearchSuggestResponse>,
  request: unknown,
): Promise<IpcResult<SearchSuggestResponse>> {
  return invokeResult('search.suggest', SEARCH_SUGGEST_FAILURE, () =>
    suggest(requireSearchSuggestRequest(request)),
  )
}
