import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../runtime/connection.ts'
import { samples } from '../../schema/samples.ts'
import { createReviewHash } from '../../internal/review-token.ts'
import { DbError } from '../../errors.ts'
import {
  requireSampleTypeRequest,
  requireSampleTypeSaveRequest,
} from '../../../../shared/ipc/sampleType.ts'
import type {
  SampleTypeRequest,
  SampleTypeSaveRequest,
  SampleTypeSnapshot,
} from '../../../../shared/ipc/sampleType.ts'

function snapshot(db: AppDatabase, sampleId: string): SampleTypeSnapshot {
  const sample = db
    .select({ sampleType: samples.sampleType })
    .from(samples)
    .where(eq(samples.id, sampleId))
    .get()
  if (!sample) {
    throw new DbError('NOT_FOUND', 'The Sample no longer exists.')
  }
  return {
    sampleId,
    sampleType: sample.sampleType ?? 'unknown',
    token: createReviewHash(
      'sample-type-v1',
      sampleId,
      sample.sampleType,
    ).digest('hex'),
  }
}

export function readSampleType(
  db: AppDatabase,
  input: SampleTypeRequest,
): SampleTypeSnapshot {
  const { sampleId } = requireSampleTypeRequest(input)
  return db.transaction(() => snapshot(db, sampleId))
}

export function saveSampleType(
  db: AppDatabase,
  input: SampleTypeSaveRequest,
): SampleTypeSnapshot {
  const request = requireSampleTypeSaveRequest(input)
  return db.transaction(
    () => {
      if (snapshot(db, request.sampleId).token !== request.token) {
        throw new DbError(
          'STALE_REVIEW',
          'Saved Sample type changed. Reload saved type and review your choice before saving again.',
        )
      }
      db.update(samples)
        .set({
          sampleType:
            request.sampleType === 'unknown' ? null : request.sampleType,
        })
        .where(eq(samples.id, request.sampleId))
        .run()
      return snapshot(db, request.sampleId)
    },
    { behavior: 'immediate' },
  )
}
