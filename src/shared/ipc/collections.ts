import type {
  Collection,
  CollectionCreateRequest,
  CollectionPage,
  CollectionPageRequest,
  CollectionSummary,
  CollectionDestination,
  CollectionDestinationsRequest,
  CollectionMembershipRequest,
  CollectionMembershipResult,
  CollectionMoveRequest,
  CollectionMoveResult,
  CollectionPlaceRequest,
  CollectionUpdateRequest,
  CollectionRemovalReview,
  CollectionRemovalRequest,
} from '../domain/collection.ts'
import { requireCollectionPage } from '../domain/collection.ts'
import {
  requirePresentationName,
  DomainValidationError,
  isEntityId,
  isRecord,
} from '../domain/validation.ts'
import { requireDescription } from '../domain/presentation.ts'
import { normalizeCatalogSearch } from '../features/library/search.ts'
import {
  collectionCreateSchema,
  collectionGetSchema,
  collectionMembershipSchema,
  collectionDestinationsSchema,
  collectionMoveSchema,
  collectionOrderTokenSchema,
  collectionPlaceSchema,
  collectionUpdateSchema,
  collectionRemovalSchema,
} from '../features/collections/schemas.ts'
import type { IpcResult } from './result.ts'

export const COLLECTION_CHANNELS = {
  update: 'collections:update',
  reviewRemoval: 'collections:review-removal',
  remove: 'collections:remove',
  create: 'collections:create',
  list: 'collections:list',
  get: 'collections:get',
  destinations: 'collections:destinations',
  setMembership: 'collections:set-membership',
  moveSample: 'collections:move-sample',
  placeSample: 'collections:place-sample',
} as const

export interface CollectionGetRequest {
  id: string
}

export interface CollectionsApi {
  update: (
    request: CollectionUpdateRequest & {
      expected: NonNullable<CollectionUpdateRequest['expected']>
    },
  ) => Promise<IpcResult<Collection>>
  reviewRemoval: (
    request: CollectionGetRequest,
  ) => Promise<IpcResult<CollectionRemovalReview>>
  remove: (
    request: CollectionRemovalRequest,
  ) => Promise<IpcResult<{ id: string }>>
  create: (request: CollectionCreateRequest) => Promise<IpcResult<Collection>>
  list: (
    request?: CollectionPageRequest,
  ) => Promise<IpcResult<CollectionPage<CollectionSummary>>>
  get: (request: CollectionGetRequest) => Promise<IpcResult<CollectionSummary>>
  destinations: (
    request: CollectionDestinationsRequest,
  ) => Promise<IpcResult<CollectionPage<CollectionDestination>>>
  setMembership: (
    request: CollectionMembershipRequest,
  ) => Promise<IpcResult<CollectionMembershipResult>>
  moveSample: (
    request: CollectionMoveRequest,
  ) => Promise<IpcResult<CollectionMoveResult>>
  placeSample: (
    request: CollectionPlaceRequest,
  ) => Promise<IpcResult<CollectionMoveResult>>
}

export function requireCollectionUpdateRequest(
  value: unknown,
): CollectionUpdateRequest {
  const parsed = collectionUpdateSchema.safeParse(value, { jitless: true })
  if (!parsed.success) {
    throw new DomainValidationError(parsed.error.issues[0].message)
  }
  return { ...parsed.data, ...requireCollectionCreateRequest(parsed.data) }
}

export function requireCollectionRemovalRequest(
  value: unknown,
): CollectionRemovalRequest {
  const parsed = collectionRemovalSchema.safeParse(value, { jitless: true })
  if (!parsed.success) {
    throw new DomainValidationError(
      'Invalid Collection removal. Review it again.',
    )
  }
  return parsed.data
}

export function isCollectionRemovalReview(
  value: unknown,
): value is CollectionRemovalReview {
  return (
    isRecord(value) &&
    isCollection(value.entity) &&
    typeof value.sampleCount === 'number' &&
    Number.isSafeInteger(value.sampleCount) &&
    value.sampleCount >= 0 &&
    isCollectionOrderToken(value.token)
  )
}

export function isCollectionRemovalResult(
  value: unknown,
): value is { id: string } {
  return isRecord(value) && isEntityId(value.id)
}

export function requireCollectionPlaceRequest(
  value: unknown,
): CollectionPlaceRequest {
  const parsed = collectionPlaceSchema.safeParse(value, { jitless: true })
  if (!parsed.success) {
    throw new DomainValidationError(
      'Invalid Collection drop. Drag a library Sample onto a current Collection member.',
    )
  }
  return parsed.data
}

export function requireCollectionMoveRequest(
  value: unknown,
): CollectionMoveRequest {
  const parsed = collectionMoveSchema.safeParse(value, { jitless: true })
  if (!parsed.success) {
    throw new DomainValidationError(
      'Invalid Collection move. Reload the current order before moving a Sample.',
    )
  }
  return parsed.data
}

export function isCollectionOrderToken(value: unknown): value is string {
  return collectionOrderTokenSchema.safeParse(value, { jitless: true }).success
}

export function isCollectionMoveResult(
  value: unknown,
): value is CollectionMoveResult {
  return (
    isRecord(value) &&
    isEntityId(value.collectionId) &&
    isEntityId(value.sampleId) &&
    typeof value.changed === 'boolean' &&
    typeof value.index === 'number' &&
    Number.isSafeInteger(value.index) &&
    value.index >= 0 &&
    isCollectionOrderToken(value.orderToken)
  )
}

export function requireCollectionDestinationsRequest(
  value: unknown,
): CollectionDestinationsRequest {
  const page = requireCollectionPage(value)
  const parsed = collectionDestinationsSchema.safeParse(value, {
    jitless: true,
  })
  if (!parsed.success) {
    throw new DomainValidationError('Invalid Collection destination search.')
  }
  return {
    ...page,
    sampleId: parsed.data.sampleId,
    search: normalizeCatalogSearch(parsed.data.search ?? ''),
  }
}

export function requireCollectionMembershipRequest(
  value: unknown,
): CollectionMembershipRequest {
  const parsed = collectionMembershipSchema.safeParse(value, { jitless: true })
  if (!parsed.success) {
    throw new DomainValidationError('Invalid Collection membership request.')
  }
  return parsed.data
}

export function isCollectionMembershipResult(
  value: unknown,
): value is CollectionMembershipResult {
  return (
    isRecord(value) &&
    typeof value.assigned === 'boolean' &&
    typeof value.changed === 'boolean'
  )
}

export function isCollectionDestinationPage(
  value: unknown,
): value is CollectionPage<CollectionDestination> {
  return (
    isCollectionPage(value) &&
    value.items.every(
      (item) => 'assigned' in item && typeof item.assigned === 'boolean',
    )
  )
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
