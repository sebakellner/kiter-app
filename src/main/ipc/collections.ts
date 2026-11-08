import {
  COLLECTION_CHANNELS,
  requireCollectionCreateRequest,
  requireCollectionGetRequest,
  requireCollectionDestinationsRequest,
  requireCollectionMembershipRequest,
  requireCollectionMoveRequest,
  requireCollectionPlaceRequest,
  requireCollectionUpdateRequest,
  requireCollectionRemovalRequest,
} from '../../shared/ipc/collections'
import { requireCollectionPage } from '../../shared/domain/collection'
import type { DbClient } from '../db'
import { handleResult } from './handler'

export function registerCollectionsIpc(database: DbClient): void {
  handleResult(
    COLLECTION_CHANNELS.update,
    'collections.update',
    'Unable to save the Collection. Reload saved details before trying again.',
    (request) =>
      database.updateCollection(requireCollectionUpdateRequest(request)),
  )
  handleResult(
    COLLECTION_CHANNELS.reviewRemoval,
    'collections.review-removal',
    'Unable to review the Collection. Try reviewing it again.',
    (request) =>
      database.reviewCollectionRemoval(requireCollectionGetRequest(request).id),
  )
  handleResult(
    COLLECTION_CHANNELS.remove,
    'collections.remove',
    'Unable to verify Collection deletion. Review it again before retrying.',
    (request) =>
      database.removeCollection(requireCollectionRemovalRequest(request)),
  )
  handleResult(
    COLLECTION_CHANNELS.placeSample,
    'collections.place-sample',
    'Unable to save the dropped Sample position. Refresh the Collection before dragging again.',
    (request) =>
      database.placeCollectionSample(requireCollectionPlaceRequest(request)),
  )
  handleResult(
    COLLECTION_CHANNELS.moveSample,
    'collections.move-sample',
    'Unable to save the Collection order. Refresh the Collection before repeating the move.',
    (request) =>
      database.moveCollectionSample(requireCollectionMoveRequest(request)),
  )
  handleResult(
    COLLECTION_CHANNELS.destinations,
    'collections.destinations',
    'Unable to load Collection destinations. Retry to check database storage.',
    (request) =>
      database.listCollectionDestinations(
        requireCollectionDestinationsRequest(request),
      ),
  )
  handleResult(
    COLLECTION_CHANNELS.setMembership,
    'collections.set-membership',
    'Unable to change Collection membership. Retry to check database storage.',
    (request) =>
      database.setCollectionMembership(
        requireCollectionMembershipRequest(request),
      ),
  )
  handleResult(
    COLLECTION_CHANNELS.create,
    'collections.create',
    'Unable to create the Collection. Your draft was preserved; check database storage before retrying.',
    (request) =>
      database.createCollection(requireCollectionCreateRequest(request)),
  )
  handleResult(
    COLLECTION_CHANNELS.list,
    'collections.list',
    'Unable to load Collections. Retry to check database storage.',
    (request) =>
      database.listCollectionSummaries(requireCollectionPage(request)),
  )
  handleResult(
    COLLECTION_CHANNELS.get,
    'collections.get',
    'Unable to load the Collection. Retry to check database storage.',
    (request) =>
      database.getCollectionSummary(requireCollectionGetRequest(request).id),
  )
}
