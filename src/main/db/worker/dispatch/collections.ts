import type {
  CollectionRequest,
  CollectionReply,
} from '../../protocol/collections.ts'
import type { AppDatabase } from '../../runtime/connection.ts'
import * as collections from '../../operations/collections/operations.ts'
import {
  reviewCollectionRemoval,
  removeCollection,
} from '../../operations/collections/removal.ts'

export function executeCollection(
  db: AppDatabase,
  request: CollectionRequest,
): CollectionReply {
  switch (request.action) {
    case 'create-collection':
      return {
        action: request.action,
        result: collections.createCollection(db, request.input),
      }
    case 'update-collection':
      return {
        action: request.action,
        result: collections.updateCollection(db, request.input),
      }
    case 'get-collection':
      return {
        action: request.action,
        result: collections.getCollection(db, request.id),
      }
    case 'list-collections':
      return {
        action: request.action,
        result: collections.listCollections(db, request.input),
      }
    case 'list-collection-samples':
      return {
        action: request.action,
        result: collections.listCollectionSamples(
          db,
          request.id,
          request.input,
        ),
      }
    case 'set-collection-membership':
      return {
        action: request.action,
        result: collections.setCollectionMembership(db, request.input),
      }
    case 'reorder-collection':
      return {
        action: request.action,
        result: collections.reorderCollection(db, request.input),
      }
    case 'review-collection-removal':
      return {
        action: request.action,
        result: reviewCollectionRemoval(db, request.id),
      }
    case 'remove-collection':
      return {
        action: request.action,
        result: removeCollection(db, request.input),
      }
  }
}
