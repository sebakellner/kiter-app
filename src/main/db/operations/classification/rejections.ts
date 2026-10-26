import { createHash } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import type { AppDatabase } from '../../runtime/connection.ts'
import { DbError } from '../../errors.ts'
import {
  CLASSIFICATION_BATCH_LIMITS,
  classificationRejectionSchema,
  type ClassificationRejection,
  type ClassificationSubject,
} from '../../../../shared/features/classification/batch-schemas.ts'
import {
  applyClassificationRejectionsRequestSchema,
  classificationRejectionMemoryRequestSchema,
  type ApplyClassificationRejectionsRequest,
  type ClassificationRejectionApplyResult,
  type ClassificationRejectionMemorySnapshot,
} from '../../../../shared/features/classification/rejection-schemas.ts'
import { classificationRejections } from '../../schema/rejections.ts'

const MAX_SERIALIZED_BYTES = CLASSIFICATION_BATCH_LIMITS.serializedBytes

// Canonical, storage-only subject key. The contract record always keeps the
// full subject; this string only provides uniqueness and scoped lookups.
export function canonicalClassificationSubjectKey(
  subject: ClassificationSubject,
): string {
  const identity =
    subject.identity.kind === 'catalog'
      ? ['catalog', subject.identity.id]
      : ['import', subject.identity.preparationId, subject.identity.id]
  return JSON.stringify([subject.kind, ...identity])
}

function canonicalRecord(record: ClassificationRejection): string {
  return JSON.stringify({
    contractVersion: record.contractVersion,
    subject: record.subject,
    target: record.target,
    evidenceKeys: record.evidenceKeys,
  })
}

// Bounded read transaction returning every remembered rejection for the given
// subjects. The token binds the complete returned set.
export function readClassificationRejections(
  db: AppDatabase,
  value: unknown,
): ClassificationRejectionMemorySnapshot {
  const parsed = classificationRejectionMemoryRequestSchema.safeParse(value)
  if (!parsed.success) {
    throw new DbError(
      'INVALID_INPUT',
      'Invalid classification rejection memory request.',
    )
  }
  const input = parsed.data
  const subjectKeys = [
    ...new Set(input.subjects.map(canonicalClassificationSubjectKey)),
  ]
  return db.transaction(() => {
    const rows = db
      .select()
      .from(classificationRejections)
      .where(inArray(classificationRejections.subjectKey, subjectKeys))
      .orderBy(
        classificationRejections.subjectKey,
        classificationRejections.dimension,
        classificationRejections.targetKey,
      )
      .limit(CLASSIFICATION_BATCH_LIMITS.proposals + 1)
      .all()
    if (rows.length > CLASSIFICATION_BATCH_LIMITS.proposals) {
      throw new DbError(
        'INVALID_INPUT',
        'Rejection memory exceeds its safety limit.',
      )
    }
    const rejections = rows.map((row) => {
      let raw: unknown
      try {
        raw = JSON.parse(row.record)
      } catch {
        throw new DbError('INVALID_INPUT', 'Rejection memory is corrupted.')
      }
      const record = classificationRejectionSchema.safeParse(raw)
      if (
        !record.success ||
        row.contractVersion !== record.data.contractVersion ||
        row.dimension !== record.data.target.dimension ||
        row.targetKey !== record.data.target.key ||
        row.subjectKey !==
          canonicalClassificationSubjectKey(record.data.subject)
      ) {
        throw new DbError('INVALID_INPUT', 'Rejection memory is corrupted.')
      }
      return record.data
    })
    const evidenceTotal = rejections.reduce(
      (total, record) => total + record.evidenceKeys.length,
      0,
    )
    if (evidenceTotal > CLASSIFICATION_BATCH_LIMITS.evidence) {
      throw new DbError(
        'INVALID_INPUT',
        'Rejection memory exceeds its safety limit.',
      )
    }
    const token = createHash('sha256')
      .update(JSON.stringify([subjectKeys, rejections]))
      .digest('hex')
    return { token, rejections }
  })
}

// Transactionally forgets scoped rejections and upserts remembered records.
// Performed inside the caller's own target transaction during confirmed
// execution; standalone calls are also atomic.
export function applyClassificationRejections(
  db: AppDatabase,
  value: unknown,
): ClassificationRejectionApplyResult {
  const parsed = applyClassificationRejectionsRequestSchema.safeParse(value)
  if (!parsed.success) {
    throw new DbError(
      'INVALID_INPUT',
      'Invalid classification rejection application.',
    )
  }
  const input: ApplyClassificationRejectionsRequest = parsed.data
  const serialized = Buffer.byteLength(JSON.stringify(input), 'utf8')
  if (serialized > MAX_SERIALIZED_BYTES) {
    throw new DbError(
      'INVALID_INPUT',
      'Rejection changes exceed their safety limit.',
    )
  }
  return db.transaction(() => {
    let forgotten = 0
    for (const scope of input.forget) {
      const result = db
        .delete(classificationRejections)
        .where(
          and(
            eq(
              classificationRejections.subjectKey,
              canonicalClassificationSubjectKey(scope.subject),
            ),
            eq(classificationRejections.dimension, scope.target.dimension),
            eq(classificationRejections.targetKey, scope.target.key),
          ),
        )
        .run()
      forgotten += result.changes
    }
    for (const record of input.remember) {
      db.insert(classificationRejections)
        .values({
          contractVersion: record.contractVersion,
          subjectKey: canonicalClassificationSubjectKey(record.subject),
          dimension: record.target.dimension,
          targetKey: record.target.key,
          record: canonicalRecord(record),
        })
        .onConflictDoUpdate({
          target: [
            classificationRejections.subjectKey,
            classificationRejections.dimension,
            classificationRejections.targetKey,
          ],
          set: {
            contractVersion: record.contractVersion,
            record: canonicalRecord(record),
          },
        })
        .run()
    }
    return { applied: input.remember.length, forgotten }
  })
}
