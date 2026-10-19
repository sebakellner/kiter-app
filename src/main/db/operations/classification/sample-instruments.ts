import { asc, eq } from 'drizzle-orm'
import type { AppDatabase } from '../../runtime/connection.ts'
import { instruments, sampleInstruments } from '../../schema/classification.ts'
import { samples } from '../../schema/samples.ts'
import { DbError } from '../../errors.ts'
import { createReviewHash } from '../../internal/review-token.ts'
import {
  requireSampleInstrumentsRequest,
  requireSampleInstrumentsSaveRequest,
} from '../../../../shared/ipc/sampleInstruments.ts'
import type {
  SampleInstrumentsRequest,
  SampleInstrumentsSaveRequest,
  SampleInstrumentsSnapshot,
} from '../../../../shared/ipc/sampleInstruments.ts'
import { getInstrument } from './operations.ts'

function snapshot(
  db: AppDatabase,
  sampleId: string,
): SampleInstrumentsSnapshot {
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
    .select({ id: instruments.id, name: instruments.name })
    .from(sampleInstruments)
    .innerJoin(instruments, eq(sampleInstruments.instrumentId, instruments.id))
    .where(eq(sampleInstruments.sampleId, sampleId))
    .orderBy(asc(instruments.id))
    .limit(1001)
    .all()
  if (assigned.length > 1000) {
    throw new DbError(
      'INVALID_INPUT',
      'This Sample exceeds the instrument editor limit of 1,000 assignments.',
    )
  }
  return {
    sampleId,
    token: createReviewHash('sample-instruments-v1', sampleId, assigned).digest(
      'hex',
    ),
    instruments: assigned,
  }
}

export function readSampleInstruments(
  db: AppDatabase,
  input: SampleInstrumentsRequest,
): SampleInstrumentsSnapshot {
  const { sampleId } = requireSampleInstrumentsRequest(input)
  return db.transaction(() => snapshot(db, sampleId))
}

export function saveSampleInstruments(
  db: AppDatabase,
  input: SampleInstrumentsSaveRequest,
): SampleInstrumentsSnapshot {
  const request = requireSampleInstrumentsSaveRequest(input)
  return db.transaction(
    () => {
      const current = snapshot(db, request.sampleId)
      if (current.token !== request.token) {
        throw new DbError(
          'STALE_REVIEW',
          'Saved instruments changed. Reload saved instruments to review your changes before saving again.',
        )
      }
      for (const id of request.instrumentIds) {
        getInstrument(db, id)
      }
      db.delete(sampleInstruments)
        .where(eq(sampleInstruments.sampleId, request.sampleId))
        .run()
      for (const id of request.instrumentIds) {
        db.insert(sampleInstruments)
          .values({ sampleId: request.sampleId, instrumentId: id })
          .run()
      }
      return snapshot(db, request.sampleId)
    },
    { behavior: 'immediate' },
  )
}
