import { requirePage } from './pagination.ts'
import type { Page, PageRequest } from './pagination.ts'

export interface Collection {
  id: string
  name: string
  description: string | null
  coverAssetId: string | null
}

export interface CollectionSummary extends Collection {
  sampleCount: number
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

export type CollectionPageRequest = PageRequest

export type CollectionPage<T> = Page<T>

export interface CollectionMembershipRequest {
  collectionId: string
  sampleId: string
  assigned: boolean
}

export interface CollectionMembershipResult {
  assigned: boolean
  changed: boolean
}

export interface CollectionDestination extends CollectionSummary {
  assigned: boolean
}

export interface CollectionDestinationsRequest extends PageRequest {
  sampleId: string
  search?: string
}

export interface CollectionReorderRequest {
  collectionId: string
  sampleIds: string[]
}

export interface CollectionMoveRequest {
  collectionId: string
  sampleId: string
  direction: 'up' | 'down'
  token: string
}

export interface CollectionMoveResult {
  collectionId: string
  sampleId: string
  changed: boolean
  index: number
  orderToken: string
}

export interface CollectionPlaceRequest {
  collectionId: string
  sampleId: string
  targetSampleId: string
  placement: 'before' | 'after'
  token: string
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
  return requirePage(value, 'Invalid Collection page request.')
}
