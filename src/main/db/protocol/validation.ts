import { isRecord } from '../../../shared/domain/validation.ts'
import { MAX_PAGE_LIMIT } from '../../../shared/domain/pagination.ts'

export function isToken(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

export function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function isPage(
  value: unknown,
  isItem: (item: unknown) => boolean,
): boolean {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isItem) &&
    isNonnegativeInteger(value.total) &&
    isNonnegativeInteger(value.offset) &&
    isNonnegativeInteger(value.limit) &&
    value.limit >= 1 &&
    value.limit <= MAX_PAGE_LIMIT &&
    value.items.length <= value.limit &&
    value.items.length <= Math.max(0, value.total - value.offset)
  )
}
