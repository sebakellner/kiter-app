import type {
  Collection,
  CollectionCreateRequest,
  CollectionUpdateRequest,
  CollectionPage,
  CollectionPageRequest,
  CollectionMembership,
  CollectionMembershipRequest,
  CollectionReorderRequest,
  CollectionRemovalReview,
  CollectionRemovalRequest,
} from '../../../shared/domain/collection.ts'
import {
  requireCollectionDescription,
  requireCollectionPage,
} from '../../../shared/domain/collection.ts'
import {
  isEntityId,
  isRecord,
  requirePresentationName,
} from '../../../shared/domain/validation.ts'
import { isToken, isNonnegativeInteger, isPage } from './validation.ts'

export type CollectionRequest =
  | { action: 'create-collection'; input: CollectionCreateRequest }
  | { action: 'update-collection'; input: CollectionUpdateRequest }
  | { action: 'get-collection' | 'review-collection-removal'; id: string }
  | { action: 'list-collections'; input: CollectionPageRequest }
  | {
      action: 'list-collection-samples'
      id: string
      input: CollectionPageRequest
    }
  | { action: 'set-collection-membership'; input: CollectionMembershipRequest }
  | { action: 'reorder-collection'; input: CollectionReorderRequest }
  | { action: 'remove-collection'; input: CollectionRemovalRequest }

export type CollectionReply =
  | {
      action: 'create-collection' | 'update-collection' | 'get-collection'
      result: Collection
    }
  | { action: 'list-collections'; result: CollectionPage<Collection> }
  | {
      action: 'list-collection-samples'
      result: CollectionPage<CollectionMembership>
    }
  | { action: 'set-collection-membership'; result: { assigned: boolean } }
  | {
      action: 'reorder-collection' | 'remove-collection'
      result: { id: string }
    }
  | { action: 'review-collection-removal'; result: CollectionRemovalReview }

export function isCollectionRequest(
  value: unknown,
): value is CollectionRequest {
  if (!isRecord(value)) {
    return false
  }
  const input = value.input
  try {
    switch (value.action) {
      case 'create-collection':
      case 'update-collection':
        if (
          !isRecord(input) ||
          (value.action === 'update-collection' && !isEntityId(input.id))
        ) {
          return false
        }
        requirePresentationName(input.name)
        requireCollectionDescription(input.description)
        return true
      case 'get-collection':
      case 'review-collection-removal':
        return isEntityId(value.id)
      case 'list-collections':
      case 'list-collection-samples':
        requireCollectionPage(input)
        return value.action === 'list-collections' || isEntityId(value.id)
      case 'set-collection-membership':
        return (
          isRecord(input) &&
          isEntityId(input.collectionId) &&
          isEntityId(input.sampleId) &&
          typeof input.assigned === 'boolean'
        )
      case 'reorder-collection':
        return (
          isRecord(input) &&
          isEntityId(input.collectionId) &&
          Array.isArray(input.sampleIds) &&
          input.sampleIds.every(isEntityId) &&
          new Set(input.sampleIds).size === input.sampleIds.length
        )
      case 'remove-collection':
        return isRecord(input) && isEntityId(input.id) && isToken(input.token)
      default:
        return false
    }
  } catch {
    return false
  }
}

function isCollection(value: unknown): boolean {
  if (!isRecord(value)) {
    return false
  }
  try {
    return (
      isEntityId(value.id) &&
      value.name === requirePresentationName(value.name) &&
      value.description === requireCollectionDescription(value.description) &&
      (value.coverAssetId === null || isEntityId(value.coverAssetId))
    )
  } catch {
    return false
  }
}

export function isCollectionReply(value: unknown): value is CollectionReply {
  if (!isRecord(value)) {
    return false
  }
  const result = value.result
  switch (value.action) {
    case 'create-collection':
    case 'update-collection':
    case 'get-collection':
      return isCollection(result)
    case 'list-collections':
      return isPage(result, isCollection)
    case 'list-collection-samples':
      return isPage(
        result,
        (item) =>
          isRecord(item) &&
          isEntityId(item.collectionId) &&
          isEntityId(item.sampleId) &&
          isNonnegativeInteger(item.position),
      )
    case 'set-collection-membership':
      return isRecord(result) && typeof result.assigned === 'boolean'
    case 'reorder-collection':
    case 'remove-collection':
      return isRecord(result) && isEntityId(result.id)
    case 'review-collection-removal':
      return (
        isRecord(result) &&
        isCollection(result.entity) &&
        isNonnegativeInteger(result.sampleCount) &&
        isToken(result.token)
      )
    default:
      return false
  }
}
