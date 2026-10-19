import { asc, eq } from 'drizzle-orm'
import type { AppDatabase } from '../../runtime/connection.ts'
import { genres, sampleGenres } from '../../schema/recognition.ts'
import { samples } from '../../schema/samples.ts'
import { DbError } from '../../errors.ts'
import { createReviewHash } from '../../internal/review-token.ts'
import {
  requireSampleGenresRequest,
  requireSampleGenresSaveRequest,
} from '../../../../shared/ipc/genres.ts'
import type {
  SampleGenresRequest,
  SampleGenresSaveRequest,
  SampleGenresSnapshot,
} from '../../../../shared/ipc/genres.ts'
import { getGenre } from './genres.ts'

function snapshot(db: AppDatabase, sampleId: string): SampleGenresSnapshot {
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
    .select({ id: genres.id, name: genres.name })
    .from(sampleGenres)
    .innerJoin(genres, eq(sampleGenres.genreId, genres.id))
    .where(eq(sampleGenres.sampleId, sampleId))
    .orderBy(asc(genres.id))
    .limit(1001)
    .all()
  if (assigned.length > 1000) {
    throw new DbError(
      'INVALID_INPUT',
      'This Sample exceeds the genre editor limit of 1,000 assignments.',
    )
  }
  return {
    sampleId,
    token: createReviewHash('sample-genres-v1', sampleId, assigned).digest(
      'hex',
    ),
    genres: assigned,
  }
}

export function readSampleGenres(
  db: AppDatabase,
  input: SampleGenresRequest,
): SampleGenresSnapshot {
  const { sampleId } = requireSampleGenresRequest(input)
  return db.transaction(() => snapshot(db, sampleId))
}

export function saveSampleGenres(
  db: AppDatabase,
  input: SampleGenresSaveRequest,
): SampleGenresSnapshot {
  const request = requireSampleGenresSaveRequest(input)
  return db.transaction(
    () => {
      const current = snapshot(db, request.sampleId)
      if (current.token !== request.token) {
        throw new DbError(
          'STALE_REVIEW',
          'Saved genres changed. Reload saved genres to review your changes before saving again.',
        )
      }
      for (const id of request.genreIds) {
        getGenre(db, id)
      }
      db.delete(sampleGenres)
        .where(eq(sampleGenres.sampleId, request.sampleId))
        .run()
      for (const id of request.genreIds) {
        db.insert(sampleGenres)
          .values({ sampleId: request.sampleId, genreId: id })
          .run()
      }
      return snapshot(db, request.sampleId)
    },
    { behavior: 'immediate' },
  )
}
