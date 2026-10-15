import type { AppDatabase } from '../../../../src/main/db/runtime/connection.ts'
import {
  createCollection,
  setCollectionMembership,
} from '../../../../src/main/db/operations/collections/operations.ts'
import type {
  Collection,
  CollectionCreateRequest,
} from '../../../../src/shared/domain/collection.ts'

export function seedSampleCollection(
  db: AppDatabase,
  sampleId: string,
  input: CollectionCreateRequest = { name: 'Selection' },
): Collection {
  const collection = createCollection(db, input)
  setCollectionMembership(db, {
    collectionId: collection.id,
    sampleId,
    assigned: true,
  })
  return collection
}
