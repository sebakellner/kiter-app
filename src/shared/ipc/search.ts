import {
  isEntityId,
  isRecord,
  DomainValidationError,
} from '../domain/validation.ts'
import { effectiveCatalogSearch } from '../features/library/search.ts'
import { catalogSearchSchema } from '../features/library/schemas.ts'
import type { IpcResult } from './result.ts'

export const SEARCH_CHANNELS = {
  suggest: 'search:suggest',
} as const

/** "At most five suggestions per entity type" (`search.md`). */
export const SUGGESTION_LIMIT = 5

export type SuggestionKind =
  'sample' | 'pack' | 'collection' | 'instrument' | 'author' | 'genre'

/** Canonical group order: the most common target first. */
export const SUGGESTION_KINDS: readonly SuggestionKind[] = [
  'sample',
  'pack',
  'collection',
  'instrument',
  'author',
  'genre',
]

export type SearchSuggestion = {
  kind: SuggestionKind
  id: string
  name: string
  /** Secondary context, such as a Sample's relative source path. */
  detail?: string
}

export type SearchSuggestionGroup = {
  kind: SuggestionKind
  items: SearchSuggestion[]
}

export type SearchSuggestRequest = {
  query: string
}

/**
 * One bounded response for every entity kind. Groups are nonempty and follow
 * `SUGGESTION_KINDS`; the renderer never queries per kind.
 */
export type SearchSuggestResponse = {
  query: string
  groups: SearchSuggestionGroup[]
}

export interface SearchApi {
  suggest: (
    request: SearchSuggestRequest,
  ) => Promise<IpcResult<SearchSuggestResponse>>
}

export function requireSearchSuggestRequest(
  value: unknown,
): Required<SearchSuggestRequest> {
  if (!isRecord(value)) {
    throw new DomainValidationError('Invalid search request.')
  }
  const parsed = catalogSearchSchema.safeParse(
    value.query === undefined ? '' : value.query,
  )
  if (!parsed.success) {
    throw new DomainValidationError(
      'Invalid search. Use at most 500 characters and 32 words, without control characters.',
    )
  }
  const query = effectiveCatalogSearch(parsed.data)
  if (query === '') {
    throw new DomainValidationError('Type at least 2 characters to search.')
  }
  return { query }
}

function isSuggestionKind(value: unknown): value is SuggestionKind {
  return (
    typeof value === 'string' &&
    SUGGESTION_KINDS.includes(value as SuggestionKind)
  )
}

export function isSearchSuggestion(value: unknown): value is SearchSuggestion {
  return (
    isRecord(value) &&
    isSuggestionKind(value.kind) &&
    isEntityId(value.id) &&
    typeof value.name === 'string' &&
    value.name.trim() !== '' &&
    (value.detail === undefined || typeof value.detail === 'string')
  )
}

export function isSearchSuggestResponse(
  value: unknown,
): value is SearchSuggestResponse {
  if (!isRecord(value) || typeof value.query !== 'string') {
    return false
  }
  const groups = value.groups
  if (!Array.isArray(groups) || groups.length > SUGGESTION_KINDS.length) {
    return false
  }
  let previous = -1
  for (const group of groups) {
    if (
      !isRecord(group) ||
      !isSuggestionKind(group.kind) ||
      !Array.isArray(group.items) ||
      group.items.length === 0 ||
      group.items.length > SUGGESTION_LIMIT ||
      !group.items.every(isSearchSuggestion)
    ) {
      return false
    }
    if (!group.items.every((item) => item.kind === group.kind)) {
      return false
    }
    const position = SUGGESTION_KINDS.indexOf(group.kind)
    if (position <= previous) {
      return false
    }
    previous = position
  }
  return true
}
