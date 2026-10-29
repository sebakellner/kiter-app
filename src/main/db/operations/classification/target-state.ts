import { createHash } from 'node:crypto'
import { isRecord } from '../../../../shared/domain/validation.ts'
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
  return classificationDigest([
    item.target,
    item.currentType,
    item.assignments,
    item.sources,
    item.originPackId,
    item.originGenreKeys,
  ])
}
