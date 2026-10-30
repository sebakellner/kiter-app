import { z } from 'zod'

/** Reviewed read-state fields of one classification target, in digest order.
 *
 * Shared because two sides name them: the worker hashes them to enforce and to
 * explain a stale target, and the renderer shows the explanation. One list means a
 * field cannot join the digest and miss the contract, or the reverse.
 */
export const CLASSIFICATION_STATE_FIELDS = [
  'target',
  'currentType',
  'assignments',
  'sources',
  'originPackId',
  'originGenreKeys',
] as const

export type ClassificationStateField =
  (typeof CLASSIFICATION_STATE_FIELDS)[number]

export const classificationStateFieldSchema = z.enum(
  CLASSIFICATION_STATE_FIELDS,
)

/** Explanation digest of one reviewed field.
 *
 * Truncated to 64 bits because it answers "which field moved", never "is this the
 * reviewed state": the enforcing token stays authoritative, so a collision here
 * can only mislabel an explanation.
 */
export const classificationStateFieldTokenSchema = z
  .string()
  .regex(/^[a-f0-9]{16}$/u)

export const classificationStateFieldsSchema = z.strictObject(
  Object.fromEntries(
    CLASSIFICATION_STATE_FIELDS.map((field) => [
      field,
      classificationStateFieldTokenSchema,
    ]),
  ) as Record<
    ClassificationStateField,
    typeof classificationStateFieldTokenSchema
  >,
)

export type ClassificationStateFields = z.infer<
  typeof classificationStateFieldsSchema
>
