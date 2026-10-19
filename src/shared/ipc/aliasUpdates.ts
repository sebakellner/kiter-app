import type { Page, PageRequest } from '../domain/pagination.ts'
import { requirePage } from '../domain/pagination.ts'
import { isRecord, DomainValidationError } from '../domain/validation.ts'
import type { IpcResult } from './result.ts'

export type AliasUpdate = {
  key: string
  targetName: string
  dimension: 'instrument' | 'genre' | 'sample-type'
  term: string
  token: string
  blockedReason: string | null
}
export type AliasUpdateRequest = { key: string; token: string }
export interface AliasUpdatesApi {
  listAliasUpdates: (
    request?: PageRequest,
  ) => Promise<IpcResult<Page<AliasUpdate>>>
  incorporateAlias: (
    request: AliasUpdateRequest,
  ) => Promise<IpcResult<{ key: string }>>
}

export function requireAliasUpdateRequest(value: unknown): AliasUpdateRequest {
  if (
    !isRecord(value) ||
    typeof value.key !== 'string' ||
    value.key.length === 0 ||
    value.key.length > 300 ||
    typeof value.token !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value.token)
  ) {
    throw new DomainValidationError('Invalid alias update request.')
  }
  return { key: value.key, token: value.token }
}

export function isAliasUpdateResult(value: unknown): value is { key: string } {
  return (
    isRecord(value) && typeof value.key === 'string' && value.key.length > 0
  )
}

export function isAliasUpdatePage(value: unknown): value is Page<AliasUpdate> {
  if (!isRecord(value)) {
    return false
  }
  try {
    const page = requirePage(value)
    return (
      value.limit === page.limit &&
      value.offset === page.offset &&
      typeof value.total === 'number' &&
      Number.isSafeInteger(value.total) &&
      value.total >= 0 &&
      Array.isArray(value.items) &&
      value.items.length <= page.limit &&
      value.items.length <= Math.max(0, value.total - page.offset) &&
      value.items.every((item) => {
        if (!isRecord(item)) {
          return false
        }
        requireAliasUpdateRequest(item)
        return (
          typeof item.term === 'string' &&
          item.term.length > 0 &&
          typeof item.targetName === 'string' &&
          item.targetName.length > 0 &&
          (item.dimension === 'instrument' ||
            item.dimension === 'genre' ||
            item.dimension === 'sample-type') &&
          (item.blockedReason === null ||
            typeof item.blockedReason === 'string')
        )
      })
    )
  } catch {
    return false
  }
}
