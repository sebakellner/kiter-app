import type {
  Collection,
  CollectionSummary,
  CollectionCreateRequest,
  CollectionUpdateRequest,
  CollectionPage,
  CollectionPageRequest,
  CollectionMembership,
  CollectionMembershipRequest,
  CollectionReorderRequest,
  CollectionRemovalReview,
  CollectionRemovalRequest,
  CollectionDestination,
  CollectionDestinationsRequest,
  CollectionMembershipResult,
  CollectionMoveRequest,
  CollectionMoveResult,
  CollectionPlaceRequest,
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
import {
  isCollection,
  isCollectionPage,
  isCollectionSummary,
  requireCollectionCreateRequest,
  requireCollectionDestinationsRequest,
  isCollectionDestinationPage,
  isCollectionMembershipResult,
  requireCollectionMoveRequest,
  isCollectionMoveResult,
  requireCollectionPlaceRequest,
} from '../../../shared/ipc/collections.ts'

export type CollectionRequest =
  | { action: 'place-collection-sample'; input: CollectionPlaceRequest }
  | { action: 'move-collection-sample'; input: CollectionMoveRequest }
  | {
      action: 'list-collection-destinations'
      input: CollectionDestinationsRequest
    }
  | { action: 'get-collection-summary'; id: string }
  | { action: 'list-collection-summaries'; input: CollectionPageRequest }
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
  | { action: 'place-collection-sample'; result: CollectionMoveResult }
  | { action: 'move-collection-sample'; result: CollectionMoveResult }
  | {
      action: 'list-collection-destinations'
      result: CollectionPage<CollectionDestination>
    }
  | { action: 'get-collection-summary'; result: CollectionSummary }
  | {
      action: 'list-collection-summaries'
      result: CollectionPage<CollectionSummary>
    }
  | {
      action: 'create-collection' | 'update-collection' | 'get-collection'
      result: Collection
    }
  | { action: 'list-collections'; result: CollectionPage<Collection> }
  | {
      action: 'list-collection-samples'
      result: CollectionPage<CollectionMembership>
    }
  | { action: 'set-collection-membership'; result: CollectionMembershipResult }
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
      case 'place-collection-sample':
        requireCollectionPlaceRequest(input)
        return true
      case 'move-collection-sample':
        requireCollectionMoveRequest(input)
        return true
      case 'list-collection-destinations':
        requireCollectionDestinationsRequest(input)
        return true
      case 'create-collection':
        requireCollectionCreateRequest(input)
        return true
      case 'update-collection':
        if (!isRecord(input) || !isEntityId(input.id)) {
          return false
        }
        requirePresentationName(input.name)
        requireCollectionDescription(input.description)
        return true
      case 'get-collection':
      case 'get-collection-summary':
      case 'review-collection-removal':
        return isEntityId(value.id)
      case 'list-collections':
      case 'list-collection-summaries':
      case 'list-collection-samples':
        requireCollectionPage(input)
        return (
          value.action !== 'list-collection-samples' || isEntityId(value.id)
        )
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

export function isCollectionReply(value: unknown): value is CollectionReply {
  if (!isRecord(value)) {
    return false
  }
  const result = value.result
  switch (value.action) {
    case 'place-collection-sample':
      return isCollectionMoveResult(result)
    case 'move-collection-sample':
      return isCollectionMoveResult(result)
    case 'list-collection-destinations':
      return isCollectionDestinationPage(result)
    case 'get-collection-summary':
      return isCollectionSummary(result)
    case 'list-collection-summaries':
      return isCollectionPage(result)
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
      return isCollectionMembershipResult(result)
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
