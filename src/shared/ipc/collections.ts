import type {
  Collection,
  CollectionCreateRequest,
  CollectionPage,
  CollectionPageRequest,
  CollectionSummary,
} from '../domain/collection.ts'
import { requireCollectionPage } from '../domain/collection.ts'
import {
  requirePresentationName,
  DomainValidationError,
  isEntityId,
  isRecord,
} from '../domain/validation.ts'
import { requireDescription } from '../domain/presentation.ts'
import {
  collectionCreateSchema,
  collectionGetSchema,
} from '../features/collections/schemas.ts'
import type { IpcResult } from './result.ts'

export const COLLECTION_CHANNELS = {
  create: 'collections:create',
  list: 'collections:list',
  get: 'collections:get',
} as const

export interface CollectionGetRequest {
  id: string
}

export interface CollectionsApi {
  create: (request: CollectionCreateRequest) => Promise<IpcResult<Collection>>
  list: (
    request?: CollectionPageRequest,
  ) => Promise<IpcResult<CollectionPage<CollectionSummary>>>
  get: (request: CollectionGetRequest) => Promise<IpcResult<CollectionSummary>>
}

export function requireCollectionCreateRequest(
  value: unknown,
): CollectionCreateRequest {
  const parsed = collectionCreateSchema.safeParse(value, { jitless: true })
  if (!parsed.success) {
    throw new DomainValidationError(parsed.error.issues[0].message)
  }
  return {
    name: requirePresentationName(parsed.data.name),
    description: requireDescription(parsed.data.description),
  }
}

export function requireCollectionGetRequest(
  value: unknown,
): CollectionGetRequest {
  const parsed = collectionGetSchema.safeParse(value, { jitless: true })
  if (!parsed.success) {
    throw new DomainValidationError('Invalid Collection identifier.')
  }
  return parsed.data
}

export function isCollection(value: unknown): value is Collection {
  if (!isRecord(value)) {
    return false
  }
  try {
    return (
      isEntityId(value.id) &&
      value.name === requirePresentationName(value.name) &&
      value.description === requireDescription(value.description) &&
      (value.coverAssetId === null || isEntityId(value.coverAssetId))
    )
  } catch {
    return false
  }
}

export function isCollectionSummary(
  value: unknown,
): value is CollectionSummary {
  return (
    isRecord(value) &&
    isCollection(value) &&
    'sampleCount' in value &&
    typeof value.sampleCount === 'number' &&
    Number.isSafeInteger(value.sampleCount) &&
    value.sampleCount >= 0
  )
}

export function isCollectionPage(
  value: unknown,
): value is CollectionPage<CollectionSummary> {
  if (!isRecord(value)) {
    return false
  }
  try {
    const { limit, offset } = requireCollectionPage(value)
    return (
      value.limit === limit &&
      value.offset === offset &&
      typeof value.total === 'number' &&
      Number.isSafeInteger(value.total) &&
      value.total >= 0 &&
      Array.isArray(value.items) &&
      value.items.every(isCollectionSummary) &&
      value.items.length <= limit &&
      value.items.length <= Math.max(0, value.total - offset) &&
      new Set(value.items.map(({ id }) => id)).size === value.items.length
    )
  } catch {
    return false
  }
}
