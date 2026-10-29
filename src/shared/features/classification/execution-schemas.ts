import { z } from 'zod'
import { isEntityId } from '../../domain/validation.ts'
import {
  CLASSIFICATION_BATCH_LIMITS,
  classificationProposalTargetSchema,
  classificationRejectionForgetSchema,
  classificationRejectionSchema,
  classificationTokenSchema,
} from './batch-schemas.ts'

const entityId = z.string().refine(isEntityId)
const token = classificationTokenSchema
const count = z.int().nonnegative()
const many = CLASSIFICATION_BATCH_LIMITS.proposals

// Selected catalog identity. Import-local handles never reach execution: drafts
// are promoted to committed identities by the owner that writes them.
const executionSubjectSchema = z.strictObject({
  kind: z.enum(['sample', 'pack']),
  id: entityId,
})

/** One reviewed target, ready for a single write transaction.
 *
 * The caller never sends decisions it built itself: main materializes them from
 * the retained review. The reviewed digests are the execution guard, not a
 * capability, and neither is trusted as a write target.
 */
export const standaloneExecutionTargetRequestSchema = z.strictObject({
  subject: executionSubjectSchema,
  // Reviewed read-state digest, recomputed inside the write transaction.
  expectedStateToken: token,
  accepts: z.array(classificationProposalTargetSchema).max(many),
  rejections: z.strictObject({
    remember: z.array(classificationRejectionSchema).max(many),
    forget: z.array(classificationRejectionForgetSchema).max(many),
  }),
})

export const standaloneExecutionOutcomeSchema = z.enum([
  'committed',
  'stale',
  'blocked',
  'failed',
])

/** Per-target outcome. A committed target wrote everything it accepted in one
 * transaction; a stale, blocked or failed target wrote nothing at all. */
export const standaloneExecutionTargetResultSchema = z.strictObject({
  subject: executionSubjectSchema,
  outcome: standaloneExecutionOutcomeSchema,
  assignments: count,
  created: z.strictObject({ instruments: count, genres: count }),
  typeChanged: z.boolean(),
  remembered: count,
  forgotten: count,
  message: z.string().min(1).max(500).optional(),
})

// The batch echoes the review reference it executed, so a renderer can detect
// that it is reading results for a review it no longer shows.
const reviewReference = {
  reviewId: z.string().min(1).max(256),
  revision: z.int().positive(),
  token,
}

export const standaloneExecutionResultSchema = z.strictObject({
  ...reviewReference,
  contractVersion: z.literal(1),
  results: z
    .array(standaloneExecutionTargetResultSchema)
    .max(CLASSIFICATION_BATCH_LIMITS.targets),
  totals: z.strictObject({
    committed: count,
    stale: count,
    blocked: count,
    failed: count,
  }),
})

export type StandaloneExecutionSubject = z.infer<typeof executionSubjectSchema>
export type StandaloneExecutionTargetRequest = z.infer<
  typeof standaloneExecutionTargetRequestSchema
>
export type StandaloneExecutionOutcome = z.infer<
  typeof standaloneExecutionOutcomeSchema
>
export type StandaloneExecutionTargetResult = z.infer<
  typeof standaloneExecutionTargetResultSchema
>
export type StandaloneExecutionResult = z.infer<
  typeof standaloneExecutionResultSchema
>
