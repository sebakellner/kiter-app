import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../runtime/connection.ts'
import { DbError } from '../../errors.ts'
import {
  standaloneExecutionTargetRequestSchema,
  type StandaloneExecutionTargetRequest,
  type StandaloneExecutionTargetResult,
} from '../../../../shared/features/classification/execution-schemas.ts'
import { recognitionVocabulary } from '../../schema/recognition.ts'
import { samples } from '../../schema/samples.ts'
import { createInstrument, setInstrumentAssignment } from './operations.ts'
import { createGenre, setGenreAssignment } from './genres.ts'
import { applyClassificationRejections } from './rejections.ts'
import { readStandaloneClassificationContext } from './standalone-context.ts'
import {
  changedStateFields,
  targetStateFields,
  targetStateToken,
} from './target-state.ts'
import { readClassificationTargetLabel } from './target-label.ts'

function requireExecution(value: unknown): StandaloneExecutionTargetRequest {
  const parsed = standaloneExecutionTargetRequestSchema.safeParse(value)
  if (!parsed.success) {
    throw new DbError(
      'INVALID_INPUT',
      'Invalid classification execution request.',
    )
  }
  return parsed.data
}

function staleState(): never {
  throw new DbError(
    'STALE_REVIEW',
    'Classification catalog inputs changed. Prepare the review again.',
  )
}

/** Commits one reviewed target, or writes nothing at all.
 *
 * The transaction re-reads the target itself and recomputes the reviewed
 * read-state digest before touching the catalog, so a decision can only land
 * while the state it was reviewed from still holds. Accepted Instrument/Genre
 * proposals re-resolve their vocabulary key instead of trusting the reviewed
 * entity binding, and required vocabulary is created inside the same transaction
 * as the assignments, the Sample-type replacement and the rejection changes.
 */
export function executeStandaloneClassificationTarget(
  db: AppDatabase,
  value: unknown,
): StandaloneExecutionTargetResult {
  const input = requireExecution(value)
  const subject = { kind: input.subject.kind, id: input.subject.id }
  const acceptKeys = new Set<string>()
  for (const accept of input.accepts) {
    const identity = `${accept.dimension}:${accept.key}`
    if (acceptKeys.has(identity)) {
      throw new DbError(
        'INVALID_INPUT',
        'A classification decision was submitted twice for one target.',
      )
    }
    acceptKeys.add(identity)
  }
  return db.transaction(
    () => {
      // Rejects a missing target before any write. One page is enough: only the
      // target context is used here.
      const context = readStandaloneClassificationContext(db, {
        targets: [subject],
        offset: 0,
      })
      const target = context.targets[0]
      if (!target) {
        throw new DbError('PROTOCOL_ERROR', 'Classification target is missing.')
      }
      const label = readClassificationTargetLabel(db, subject)
      const result: StandaloneExecutionTargetResult = {
        subject,
        ...(label === null ? {} : { label }),
        outcome: 'committed',
        assignments: 0,
        created: { instruments: 0, genres: 0 },
        typeChanged: false,
        remembered: 0,
        forgotten: 0,
      }
      if (targetStateToken(target) !== input.expectedStateToken) {
        // The guard above already refused the write. These field digests only turn
        // that refusal into something the surface can explain, so they are read
        // from the same in-transaction snapshot and never trusted as authority.
        const changedFields = input.expectedStateFields
          ? changedStateFields(
              input.expectedStateFields,
              targetStateFields(target),
            )
          : []
        return {
          ...result,
          outcome: 'stale',
          ...(changedFields.length > 0 ? { changedFields } : {}),
          message: 'Reviewed state changed. Prepare the review again.',
        }
      }
      for (const accept of input.accepts) {
        if (accept.dimension === 'sample-type') {
          if (subject.kind !== 'sample') {
            throw new DbError('INVALID_INPUT', 'A Pack has no Sample type.')
          }
          if (target.currentType === accept.key) {
            continue
          }
          db.update(samples)
            .set({ sampleType: accept.key })
            .where(eq(samples.id, subject.id))
            .run()
          result.typeChanged = true
          continue
        }
        const entry = db
          .select()
          .from(recognitionVocabulary)
          .where(eq(recognitionVocabulary.key, accept.key))
          .get()
        if (!entry || entry.dimension !== accept.dimension) {
          staleState()
        }
        if (entry.state === 'deleted') {
          staleState()
        }
        // The reviewed entity binding is an expectation, never a write target: the
        // key is re-resolved, and a key remapped since review writes nothing.
        const current =
          accept.dimension === 'instrument' ? entry.instrumentId : entry.genreId
        if (accept.entityId !== null && current !== accept.entityId) {
          staleState()
        }
        if (accept.dimension === 'instrument') {
          const id = current ?? createInstrument(db, { name: entry.name }).id
          if (current === null) {
            result.created.instruments++
          }
          setInstrumentAssignment(db, { id, target: subject, assigned: true })
        } else {
          const id = current ?? createGenre(db, { name: entry.name }).id
          if (current === null) {
            result.created.genres++
          }
          setGenreAssignment(db, { id, target: subject, assigned: true })
        }
        result.assignments++
      }
      const { remember, forget } = input.rejections
      if (remember.length > 0 || forget.length > 0) {
        const applied = applyClassificationRejections(db, { remember, forget })
        result.remembered = applied.applied
        result.forgotten = applied.forgotten
      }
      return result
    },
    { behavior: 'immediate' },
  )
}
