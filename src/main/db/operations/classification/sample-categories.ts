import { asc, eq } from 'drizzle-orm'
import type { AppDatabase } from '../../runtime/connection.ts'
import { categories, sampleCategories } from '../../schema/classification.ts'
import { samples } from '../../schema/samples.ts'
import { DbError } from '../../errors.ts'
import { createReviewHash } from '../../internal/review-token.ts'
import {
  requireSampleCategoriesRequest,
  requireSampleCategoriesSaveRequest,
} from '../../../../shared/ipc/sampleCategories.ts'
import type {
  SampleCategoriesRequest,
  SampleCategoriesSaveRequest,
  SampleCategoriesSnapshot,
} from '../../../../shared/ipc/sampleCategories.ts'
import { getCategory } from './operations.ts'

function snapshot(db: AppDatabase, sampleId: string): SampleCategoriesSnapshot {
  if (
    !db
      .select({ id: samples.id })
      .from(samples)
      .where(eq(samples.id, sampleId))
      .get()
  ) {
    throw new DbError('NOT_FOUND', 'The Sample no longer exists.')
  }
  const assigned = db
    .select({ id: categories.id, name: categories.name })
    .from(sampleCategories)
    .innerJoin(categories, eq(sampleCategories.categoryId, categories.id))
    .where(eq(sampleCategories.sampleId, sampleId))
    .orderBy(asc(categories.id))
    .limit(1001)
    .all()
  if (assigned.length > 1000) {
    throw new DbError(
      'INVALID_INPUT',
      'This Sample exceeds the category editor limit of 1,000 assignments.',
    )
  }
  return {
    sampleId,
    token: createReviewHash('sample-categories-v1', sampleId, assigned).digest(
      'hex',
    ),
    categories: assigned,
  }
}

export function readSampleCategories(
  db: AppDatabase,
  input: SampleCategoriesRequest,
): SampleCategoriesSnapshot {
  const { sampleId } = requireSampleCategoriesRequest(input)
  return db.transaction(() => snapshot(db, sampleId))
}

export function saveSampleCategories(
  db: AppDatabase,
  input: SampleCategoriesSaveRequest,
): SampleCategoriesSnapshot {
  const request = requireSampleCategoriesSaveRequest(input)
  return db.transaction(
    () => {
      const current = snapshot(db, request.sampleId)
      if (current.token !== request.token) {
        throw new DbError(
          'STALE_REVIEW',
          'Saved categories changed. Reload saved categories to review your changes before saving again.',
        )
      }
      for (const id of request.categoryIds) {
        getCategory(db, id)
      }
      db.delete(sampleCategories)
        .where(eq(sampleCategories.sampleId, request.sampleId))
        .run()
      for (const id of request.categoryIds) {
        db.insert(sampleCategories)
          .values({ sampleId: request.sampleId, categoryId: id })
          .run()
      }
      return snapshot(db, request.sampleId)
    },
    { behavior: 'immediate' },
  )
}
