import { z } from 'zod'
import {
  classificationAmbiguityPageSchema,
  classificationProposalPageSchema,
  classificationReviewSummarySchema,
} from '../features/classification/batch-schemas.ts'
import { standaloneReviewSubjectSchema } from './standaloneReview.ts'
import { standaloneExecutionResultSchema } from '../features/classification/execution-schemas.ts'

// Responses stay strict: a renderer may only trust fields main actually promised,
// and a contract extension must declare them here instead of slipping through.

export const standaloneReviewSummarySchema = classificationReviewSummarySchema

export const standaloneReviewPreparationSchema =
  classificationReviewSummarySchema.extend({
    subjectScope: z.array(standaloneReviewSubjectSchema).min(1).max(100),
  })

export const standaloneReviewProposalPageSchema =
  classificationProposalPageSchema

export const standaloneReviewAmbiguityPageSchema =
  classificationAmbiguityPageSchema

export const standaloneReviewDiscardResultSchema = z.strictObject({
  reviewId: z.string().min(1).max(256),
})

export const standaloneReviewExecutionResultSchema =
  standaloneExecutionResultSchema

// Preload cannot compile generated code, so guards always interpret.
const OPTIONS = { jitless: true } as const

function guard<T>(schema: z.ZodType<T>): (value: unknown) => value is T {
  return (value: unknown): value is T =>
    schema.safeParse(value, OPTIONS).success
}

export const isStandaloneReviewSummary = guard(standaloneReviewSummarySchema)
export const isStandaloneReviewPreparation = guard(
  standaloneReviewPreparationSchema,
)
export const isStandaloneReviewProposalPage = guard(
  standaloneReviewProposalPageSchema,
)
export const isStandaloneReviewAmbiguityPage = guard(
  standaloneReviewAmbiguityPageSchema,
)
export const isStandaloneReviewDiscardResult = guard(
  standaloneReviewDiscardResultSchema,
)
export const isStandaloneReviewExecutionResult = guard(
  standaloneReviewExecutionResultSchema,
)
