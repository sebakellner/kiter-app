import {
  isSearchSuggestResponse,
  requireSearchSuggestRequest,
  type SearchSuggestRequest,
  type SearchSuggestResponse,
} from '../../../shared/ipc/search.ts'
import { isRecord } from '../../../shared/domain/validation.ts'

export type SearchRequest = {
  action: 'search-suggest'
  input: SearchSuggestRequest
}

export type SearchReply = {
  action: 'search-suggest'
  result: SearchSuggestResponse
}

export function isSearchRequest(value: unknown): value is SearchRequest {
  if (!isRecord(value)) {
    return false
  }
  try {
    switch (value.action) {
      case 'search-suggest':
        requireSearchSuggestRequest(value.input)
        return true
      default:
        return false
    }
  } catch {
    return false
  }
}

export function isSearchReply(value: unknown): value is SearchReply {
  return (
    isRecord(value) &&
    value.action === 'search-suggest' &&
    isSearchSuggestResponse(value.result)
  )
}
