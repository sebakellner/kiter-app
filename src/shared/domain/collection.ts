import { DomainValidationError, isRecord } from './validation.ts'

export interface Collection {
  id: string
  name: string
  description: string | null
  coverAssetId: string | null
}

export interface CollectionMembership {
  collectionId: string
  sampleId: string
  position: number
}

export interface CollectionCreateRequest {
  name: string
  description?: string | null
}

export interface CollectionUpdateRequest extends CollectionCreateRequest {
  id: string
}

export interface CollectionPageRequest {
  limit?: number
  offset?: number
}

export interface CollectionPage<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

export interface CollectionMembershipRequest {
  collectionId: string
  sampleId: string
  assigned: boolean
}

export interface CollectionReorderRequest {
  collectionId: string
  sampleIds: string[]
}

export interface CollectionRemovalReview {
  entity: Collection
  sampleCount: number
  token: string
}

export interface CollectionRemovalRequest {
  id: string
  token: string
}

export { requireDescription as requireCollectionDescription } from './presentation.ts'

export function requireCollectionPage(
  value: unknown,
): Required<CollectionPageRequest> {
  if (!isRecord(value)) {
    throw new DomainValidationError('Invalid Collection page request.')
  }
  const { limit = 50, offset = 0 } = value
  if (
    typeof limit !== 'number' ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    typeof offset !== 'number' ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    throw new DomainValidationError('Invalid Collection page request.')
  }
  return { limit, offset }
}
