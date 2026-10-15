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

export function requireCollectionDescription(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null
  }
  if (typeof value !== 'string' || /[^\P{Cc}\n\r]/u.test(value)) {
    throw new DomainValidationError(
      'Descriptions must not contain control characters.',
    )
  }
  const description = value.normalize('NFC')
  if (Array.from(description).length > 5000) {
    throw new DomainValidationError(
      'Descriptions must contain at most 5000 Unicode characters.',
    )
  }
  return description.trim() ? description : null
}

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
