import { and, eq, gt } from 'drizzle-orm'
import type {
  PackRemovalReview,
  PackRemovalRequest,
} from '../../../../shared/domain/pack.ts'
import type { AppDatabase } from '../../runtime/connection.ts'
import { DbError } from '../../errors.ts'
import {
  createReviewHash,
  requireReviewToken,
} from '../../internal/review-token.ts'
import { packs } from '../../schema/packs.ts'
import { samples } from '../../schema/samples.ts'
import { packAuthors, packCategories } from '../../schema/classification.ts'
import { scheduleUnusedImageCleanup } from '../assets/references.ts'
import { getPack } from './operations.ts'

function removalReview(db: AppDatabase, id: string): PackRemovalReview {
  const entity = getPack(db, id)
  const hash = createReviewHash('pack-removal', entity)
  let sampleCount = 0,
    categoryCount = 0,
    authorCount = 0
  // Hash exact associations in bounded batches, not just their counts.
  for (const kind of ['sample', 'category', 'author'] as const) {
    let after = ''
    for (;;) {
      const batch =
        kind === 'sample'
          ? db
              .select({ id: samples.id, state: samples.originAssignment })
              .from(samples)
              .where(and(eq(samples.packId, id), gt(samples.id, after)))
              .orderBy(samples.id)
              .limit(500)
              .all()
          : kind === 'category'
            ? db
                .select({ id: packCategories.categoryId })
                .from(packCategories)
                .where(
                  and(
                    eq(packCategories.packId, id),
                    gt(packCategories.categoryId, after),
                  ),
                )
                .orderBy(packCategories.categoryId)
                .limit(500)
                .all()
            : db
                .select({ id: packAuthors.authorId })
                .from(packAuthors)
                .where(
                  and(
                    eq(packAuthors.packId, id),
                    gt(packAuthors.authorId, after),
                  ),
                )
                .orderBy(packAuthors.authorId)
                .limit(500)
                .all()
      batch.forEach((row) => hash.update(JSON.stringify([kind, row])))
      if (kind === 'sample') {
        sampleCount += batch.length
      }
      if (kind === 'category') {
        categoryCount += batch.length
      }
      if (kind === 'author') {
        authorCount += batch.length
      }
      if (batch.length < 500) {
        break
      }
      after = batch[batch.length - 1].id
    }
  }
  return {
    entity,
    sampleCount,
    categoryCount,
    authorCount,
    token: hash.digest('hex'),
  }
}

export function reviewPackRemoval(
  db: AppDatabase,
  id: string,
): PackRemovalReview {
  return db.transaction(() => removalReview(db, id))
}

export function removePack(
  db: AppDatabase,
  input: PackRemovalRequest,
): { id: string } {
  requireReviewToken(input.token, 'A review token is required.')
  return db.transaction(
    () => {
      const review = removalReview(db, input.id)
      if (review.token !== input.token) {
        throw new DbError(
          'STALE_REVIEW',
          'The Pack changed. Review it again before removing.',
        )
      }
      db.update(samples)
        .set({ packId: null, originAssignment: 'manual' })
        .where(eq(samples.packId, input.id))
        .run()
      db.delete(packs).where(eq(packs.id, input.id)).run()
      scheduleUnusedImageCleanup(db, review.entity.coverAssetId)
      return { id: input.id }
    },
    { behavior: 'immediate' },
  )
}
