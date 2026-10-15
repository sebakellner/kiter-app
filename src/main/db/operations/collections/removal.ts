import { and, eq, gt } from 'drizzle-orm'
import type {
  CollectionRemovalReview,
  CollectionRemovalRequest,
} from '../../../../shared/domain/collection.ts'
import { requireEntityId } from '../../../../shared/domain/validation.ts'
import type { AppDatabase } from '../../runtime/connection.ts'
import { DbError } from '../../errors.ts'
import {
  createReviewHash,
  requireReviewToken,
} from '../../internal/review-token.ts'
import { collections, collectionSamples } from '../../schema/collections.ts'
import { scheduleUnusedImageCleanup } from '../assets/references.ts'
import { getCollection } from './operations.ts'

function removalReview(db: AppDatabase, id: string): CollectionRemovalReview {
  const entity = getCollection(db, id)
  const hash = createReviewHash('collection', entity)
  let after = '',
    sampleCount = 0
  for (;;) {
    const batch = db
      .select()
      .from(collectionSamples)
      .where(
        and(
          eq(collectionSamples.collectionId, id),
          gt(collectionSamples.sampleId, after),
        ),
      )
      .orderBy(collectionSamples.sampleId)
      .limit(500)
      .all()
    for (const row of batch) {
      hash.update(JSON.stringify([row.sampleId, row.position]))
    }
    sampleCount += batch.length
    if (batch.length < 500) {
      break
    }
    after = batch[batch.length - 1].sampleId
  }
  return { entity, sampleCount, token: hash.digest('hex') }
}

export function reviewCollectionRemoval(
  db: AppDatabase,
  id: string,
): CollectionRemovalReview {
  return db.transaction(() => removalReview(db, id))
}

export function removeCollection(
  db: AppDatabase,
  input: CollectionRemovalRequest,
): { id: string } {
  requireEntityId(input.id)
  requireReviewToken(input.token)
  return db.transaction(
    () => {
      const review = removalReview(db, input.id)
      if (review.token !== input.token) {
        throw new DbError(
          'STALE_REVIEW',
          'The Collection changed. Review it again before removing.',
        )
      }
      db.delete(collections).where(eq(collections.id, input.id)).run()
      scheduleUnusedImageCleanup(db, review.entity.coverAssetId)
      return { id: input.id }
    },
    { behavior: 'immediate' },
  )
}
