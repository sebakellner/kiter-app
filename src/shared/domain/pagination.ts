import { DomainValidationError, isRecord } from './validation.ts'

export const DEFAULT_PAGE_LIMIT = 50
export const MAX_PAGE_LIMIT = 100

export interface PageRequest {
  limit?: number
  offset?: number
}

export interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

export function requirePage(
  value: unknown,
  message = 'Invalid page request.',
): Required<PageRequest> {
  if (!isRecord(value)) {
    throw new DomainValidationError(message)
  }
  const { limit = DEFAULT_PAGE_LIMIT, offset = 0 } = value
  if (
    typeof limit !== 'number' ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_PAGE_LIMIT ||
    typeof offset !== 'number' ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    throw new DomainValidationError(message)
  }
  return { limit, offset }
}
