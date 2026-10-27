import { z } from 'zod'
import { DomainValidationError, isEntityId } from '../domain/validation.ts'
import {
  classificationAcceptAllSchema,
  classificationDecisionsSchema,
  classificationReviewPageSchema,
} from '../features/classification/batch-schemas.ts'
import type {
  ClassificationAmbiguityRow,
  ClassificationReviewPage,
  ClassificationReviewRow,
  ClassificationReviewSummary,
} from '../features/classification/batch-schemas.ts'
import type { IpcResult } from './result.ts'

export const STANDALONE_REVIEW_CHANNELS = {
  prepare: 'classification:prepare-standalone-review',
  listProposals: 'classification:list-standalone-review-proposals',
  listAmbiguities: 'classification:list-standalone-review-ambiguities',
  stage: 'classification:stage-standalone-review',
  acceptAll: 'classification:accept-all-standalone-review',
  discard: 'classification:discard-standalone-review',
} as const

// Selected existing catalog identity, never an import-local preparation handle.
// Response guards reuse this schema so both sides agree on the accepted scope.
export const standaloneReviewSubjectSchema = z.strictObject({
  kind: z.enum(['sample', 'pack']),
  id: z.string().refine(isEntityId),
})

export const standaloneReviewPrepareSchema = z.strictObject({
  subjects: z.array(standaloneReviewSubjectSchema).min(1).max(100),
})

const reviewId = z.string().min(1).max(256)

export const standaloneReviewDiscardSchema = z.strictObject({
  reviewId,
})

// Pages carry the complete reference so main can reject a stale review before
// answering; offset/limit keep their documented defaults.
export const standaloneReviewPageRequestSchema = classificationReviewPageSchema

// Staging is one atomic group of explicit choices, exactly as the review core
// accepts it; a renderer cannot stage an implicit page or filter scope.
export const standaloneReviewDecisionsRequestSchema =
  classificationDecisionsSchema

export const standaloneReviewAcceptAllRequestSchema =
  classificationAcceptAllSchema

export type StandaloneReviewSubject = z.infer<
  typeof standaloneReviewSubjectSchema
>

/** The complete target scope a preparation owns, so the renderer can show
 * Accept all scope without extra reads. */
export type StandaloneReviewPreparation = ClassificationReviewSummary & {
  subjectScope: StandaloneReviewSubject[]
}
export type StandaloneReviewPrepareRequest = z.infer<
  typeof standaloneReviewPrepareSchema
>
export type StandaloneReviewDiscardRequest = z.infer<
  typeof standaloneReviewDiscardSchema
>
// Page callers may omit offset/limit, so the request type is the schema input
// and main always answers from the parsed values.
export type StandaloneReviewPageRequest = z.input<
  typeof standaloneReviewPageRequestSchema
>
export type StandaloneReviewDecisionsRequest = z.infer<
  typeof standaloneReviewDecisionsRequestSchema
>
export type StandaloneReviewAcceptAllRequest = z.infer<
  typeof standaloneReviewAcceptAllRequestSchema
>

// Preload cannot compile generated validators, so every guard interprets.
const OPTIONS = { jitless: true } as const

function require<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value, OPTIONS)
  if (!result.success) {
    throw new DomainValidationError(message)
  }
  return result.data
}

export function requireStandaloneReviewPrepareRequest(
  value: unknown,
): StandaloneReviewPrepareRequest {
  return require(standaloneReviewPrepareSchema, value, 'Invalid standalone classification review request.')
}

export function requireStandaloneReviewPageRequest(
  value: unknown,
): StandaloneReviewPageRequest {
  return require(standaloneReviewPageRequestSchema, value, 'Invalid standalone classification review page request.')
}

export function requireStandaloneReviewDecisionsRequest(
  value: unknown,
): StandaloneReviewDecisionsRequest {
  return require(standaloneReviewDecisionsRequestSchema, value, 'Invalid standalone classification review decision request.')
}

export function requireStandaloneReviewAcceptAllRequest(
  value: unknown,
): StandaloneReviewAcceptAllRequest {
  return require(standaloneReviewAcceptAllRequestSchema, value, 'Invalid standalone classification review acceptance request.')
}

export function requireStandaloneReviewDiscardRequest(
  value: unknown,
): StandaloneReviewDiscardRequest {
  return require(standaloneReviewDiscardSchema, value, 'Invalid standalone classification review discard request.')
}

export interface StandaloneReviewApi {
  prepare: (
    request: StandaloneReviewPrepareRequest,
  ) => Promise<IpcResult<StandaloneReviewPreparation>>
  listProposals: (
    request: StandaloneReviewPageRequest,
  ) => Promise<IpcResult<ClassificationReviewPage<ClassificationReviewRow>>>
  listAmbiguities: (
    request: StandaloneReviewPageRequest,
  ) => Promise<IpcResult<ClassificationReviewPage<ClassificationAmbiguityRow>>>
  stage: (
    request: StandaloneReviewDecisionsRequest,
  ) => Promise<IpcResult<ClassificationReviewSummary>>
  acceptAll: (
    request: StandaloneReviewAcceptAllRequest,
  ) => Promise<IpcResult<ClassificationReviewSummary>>
  discard: (
    request: StandaloneReviewDiscardRequest,
  ) => Promise<IpcResult<{ reviewId: string }>>
}
