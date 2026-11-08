import type { ClientRequest } from './core.ts'
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

export interface CollectionsCommands {
  createCollection(input: CollectionCreateRequest): Promise<Collection>
  updateCollection(input: CollectionUpdateRequest): Promise<Collection>
  getCollection(id: string): Promise<Collection>
  getCollectionSummary(id: string): Promise<CollectionSummary>
  listCollectionSummaries(
    input?: CollectionPageRequest,
  ): Promise<CollectionPage<CollectionSummary>>
  listCollectionDestinations(
    input: CollectionDestinationsRequest,
  ): Promise<CollectionPage<CollectionDestination>>
  listCollections(
    input?: CollectionPageRequest,
  ): Promise<CollectionPage<Collection>>
  listCollectionSamples(
    id: string,
    input?: CollectionPageRequest,
  ): Promise<CollectionPage<CollectionMembership>>
  setCollectionMembership(
    input: CollectionMembershipRequest,
  ): Promise<CollectionMembershipResult>
  moveCollectionSample(
    input: CollectionMoveRequest,
  ): Promise<CollectionMoveResult>
  placeCollectionSample(
    input: CollectionPlaceRequest,
  ): Promise<CollectionMoveResult>
  reorderCollection(input: CollectionReorderRequest): Promise<{ id: string }>
  reviewCollectionRemoval(id: string): Promise<CollectionRemovalReview>
  removeCollection(input: CollectionRemovalRequest): Promise<{ id: string }>
}

export function collectionsCommands(
  request: ClientRequest,
): CollectionsCommands {
  return {
    async createCollection(
      input: CollectionCreateRequest,
    ): Promise<Collection> {
      return request({ action: 'create-collection', input })
    },

    async updateCollection(
      input: CollectionUpdateRequest,
    ): Promise<Collection> {
      return request({ action: 'update-collection', input })
    },

    async getCollection(id: string): Promise<Collection> {
      return request({ action: 'get-collection', id })
    },

    async getCollectionSummary(id: string): Promise<CollectionSummary> {
      return request({ action: 'get-collection-summary', id })
    },

    async listCollectionSummaries(
      input: CollectionPageRequest = {},
    ): Promise<CollectionPage<CollectionSummary>> {
      return request({ action: 'list-collection-summaries', input })
    },

    async listCollectionDestinations(
      input: CollectionDestinationsRequest,
    ): Promise<CollectionPage<CollectionDestination>> {
      return request({ action: 'list-collection-destinations', input })
    },

    async listCollections(
      input: CollectionPageRequest = {},
    ): Promise<CollectionPage<Collection>> {
      return request({ action: 'list-collections', input })
    },

    async listCollectionSamples(
      id: string,
      input: CollectionPageRequest = {},
    ): Promise<CollectionPage<CollectionMembership>> {
      return request({ action: 'list-collection-samples', id, input })
    },

    async setCollectionMembership(
      input: CollectionMembershipRequest,
    ): Promise<CollectionMembershipResult> {
      return request({ action: 'set-collection-membership', input })
    },

    async moveCollectionSample(
      input: CollectionMoveRequest,
    ): Promise<CollectionMoveResult> {
      return request({ action: 'move-collection-sample', input })
    },

    async placeCollectionSample(
      input: CollectionPlaceRequest,
    ): Promise<CollectionMoveResult> {
      return request({ action: 'place-collection-sample', input })
    },

    async reorderCollection(
      input: CollectionReorderRequest,
    ): Promise<{ id: string }> {
      return request({ action: 'reorder-collection', input })
    },

    async reviewCollectionRemoval(
      id: string,
    ): Promise<CollectionRemovalReview> {
      return request({ action: 'review-collection-removal', id })
    },

    async removeCollection(
      input: CollectionRemovalRequest,
    ): Promise<{ id: string }> {
      return request({ action: 'remove-collection', input })
    },
  }
}
