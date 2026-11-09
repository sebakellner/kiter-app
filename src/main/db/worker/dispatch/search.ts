import type { SearchRequest, SearchReply } from '../../protocol/search.ts'
import type { AppDatabase } from '../../runtime/connection.ts'
import { searchSuggest } from '../../operations/search/suggestions.ts'

export function executeSearch(
  db: AppDatabase,
  request: SearchRequest,
): SearchReply {
  switch (request.action) {
    case 'search-suggest':
      return {
        action: request.action,
        result: searchSuggest(db, request.input),
      }
  }
}
