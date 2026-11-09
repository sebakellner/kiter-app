import type { ClientRequest } from './core.ts'
import type {
  SearchSuggestRequest,
  SearchSuggestResponse,
} from '../../../shared/ipc/search.ts'

export interface SearchCommands {
  searchSuggest(input: SearchSuggestRequest): Promise<SearchSuggestResponse>
}

export function searchCommands(request: ClientRequest): SearchCommands {
  return {
    async searchSuggest(
      input: SearchSuggestRequest,
    ): Promise<SearchSuggestResponse> {
      return request({ action: 'search-suggest', input })
    },
  }
}
