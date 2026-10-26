import { z } from 'zod'
import {
  CLASSIFICATION_BATCH_LIMITS,
  classificationRejectionForgetSchema,
  classificationRejectionSchema,
  classificationSubjectSchema,
  classificationTokenSchema,
} from './batch-schemas.ts'

// Read remembered rejections for a bounded set of subjects. The returned token
// binds the complete returned record set so callers can detect memory changes
// before reusing previously reviewed proposals.
export const classificationRejectionMemoryRequestSchema = z.strictObject({
  subjects: z
    .array(classificationSubjectSchema)
    .min(1)
    .max(CLASSIFICATION_BATCH_LIMITS.targets),
})

export const classificationRejectionMemorySnapshotSchema = z.strictObject({
  token: classificationTokenSchema,
  rejections: z
    .array(classificationRejectionSchema)
    .max(CLASSIFICATION_BATCH_LIMITS.proposals),
})

export const applyClassificationRejectionsRequestSchema = z
  .strictObject({
    remember: z
      .array(classificationRejectionSchema)
      .max(CLASSIFICATION_BATCH_LIMITS.proposals),
    forget: z
      .array(classificationRejectionForgetSchema)
      .max(CLASSIFICATION_BATCH_LIMITS.proposals),
  })
  .refine(
    (value) => value.remember.length + value.forget.length > 0,
    'Expected at least one rejection change.',
  )

export type ClassificationRejectionMemoryRequest = z.infer<
  typeof classificationRejectionMemoryRequestSchema
>
export type ClassificationRejectionMemorySnapshot = z.infer<
  typeof classificationRejectionMemorySnapshotSchema
>
export type ApplyClassificationRejectionsRequest = z.infer<
  typeof applyClassificationRejectionsRequestSchema
>
export type ClassificationRejectionApplyResult = {
  applied: number
  forgotten: number
}
