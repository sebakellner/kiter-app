import { createHash } from 'node:crypto'
import { isRecord } from '../../../../shared/domain/validation.ts'
import {
  CLASSIFICATION_STATE_FIELDS,
  type ClassificationStateField,
  type ClassificationStateFields,
} from '../../../../shared/features/classification/state-fields.ts'
import type { StandaloneClassificationContextTarget } from '../../../../shared/features/classification/standalone-context-schemas.ts'

type ContextTarget = StandaloneClassificationContextTarget

// Stable serialization for classification read-state digests: object field order
// is not significant, arrays keep their owner-defined order.
export function serializeClassificationState(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    isRecord(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : item,
  )
}

export function classificationDigest(value: unknown): string {
  return createHash('sha256')
    .update(serializeClassificationState(value))
    .digest('hex')
}

/** Reviewed read-state digest for one classification target.
 *
 * The worker owns this definition because the worker enforces it: execution
 * recomputes the digest from the values it reads itself inside the write
 * transaction, so a reviewed decision can only commit while the state it was
 * reviewed from still holds. The main-side snapshot builder reuses this function,
 * so both sides agree by construction instead of by a duplicated hash.
 */
export function targetStateToken(item: ContextTarget): string {
  return classificationDigest(
    CLASSIFICATION_STATE_FIELDS.map((field) => item[field]),
  )
}

/** Per-field digests that explain a stale target, never the guard itself. */
export function targetStateFields(
  item: ContextTarget,
): ClassificationStateFields {
  return Object.fromEntries(
    CLASSIFICATION_STATE_FIELDS.map((field) => [
      field,
      classificationDigest(item[field]).slice(0, 16),
    ]),
  ) as ClassificationStateFields
}

/** Fields whose current value differs from the reviewed one, in canonical order. */
export function changedStateFields(
  reviewed: ClassificationStateFields,
  current: ClassificationStateFields,
): ClassificationStateField[] {
  return CLASSIFICATION_STATE_FIELDS.filter(
    (field) => reviewed[field] !== current[field],
  )
}
