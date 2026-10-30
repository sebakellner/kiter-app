import { z } from 'zod'
import { isEntityId, requirePresentationName } from '../../domain/validation.ts'
import { classificationStateFieldsSchema } from './state-fields.ts'

export const CLASSIFICATION_BATCH_LIMITS = {
  targets: 100,
  proposals: 2000,
  evidence: 10000,
  decisions: 100,
  page: 100,
  serializedBytes: 8 * 1024 * 1024,
} as const

const identifier = z.string().min(1).max(4096)
const opaqueId = z.string().min(1).max(256)
const entityId = z.string().refine(isEntityId)
export const classificationTokenSchema = z.string().regex(/^[a-f0-9]{64}$/u)
const token = classificationTokenSchema
const dimension = z.enum(['instrument', 'genre', 'sample-type'])
const sampleType = z.enum(['loop', 'one-shot'])
const name = z
  .string()
  .max(480)
  .refine((value) => {
    try {
      return requirePresentationName(value) === value
    } catch {
      return false
    }
  }, 'Expected a normalized classification name.')

// Import-local identities are bound to their preparation, never reserved UUIDs.
export const classificationSubjectSchema = z.strictObject({
  kind: z.enum(['sample', 'pack']),
  identity: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('catalog'), id: entityId }),
    z.strictObject({
      kind: z.literal('import'),
      preparationId: opaqueId,
      id: opaqueId,
    }),
  ]),
})

export const classificationRecognitionTargetSchema = z.strictObject({
  dimension,
  key: identifier,
})
const recognitionTarget = classificationRecognitionTargetSchema

export const classificationEvidenceSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('path'),
    occurrence: identifier,
    component: z.enum(['root', 'folder', 'filename']),
    availability: z.enum(['observed', 'cataloged']),
    text: z.string().min(1).max(4096),
    clue: identifier,
    term: identifier,
    rule: z.enum(['name', 'alias']),
    ruleVersion: z.literal('path-v2'),
    span: z
      .tuple([z.int().nonnegative(), z.int().positive()])
      .refine(([start, end]) => start < end, 'Expected a nonempty token span.'),
  }),
  z.strictObject({
    kind: z.literal('pack-genre'),
    // Catalog Pack UUID, or an import-local Pack identity encoded by its caller.
    packId: identifier,
    genreKey: identifier,
  }),
])

export const classificationProposalTargetSchema = z.discriminatedUnion(
  'dimension',
  [
    z.strictObject({
      dimension: z.literal('instrument'),
      key: identifier,
      name,
      entityId: entityId.nullable(),
    }),
    z.strictObject({
      dimension: z.literal('genre'),
      key: identifier,
      name,
      entityId: entityId.nullable(),
    }),
    z.strictObject({ dimension: z.literal('sample-type'), key: sampleType }),
  ],
)

const proposal = z.strictObject({
  target: classificationProposalTargetSchema,
  evidence: z.array(classificationEvidenceSchema).min(1).max(1000),
  // A staged Pack Genre acceptance or explicit new-Pack Genre can supply a dependency.
  dependencies: z
    .array(
      z.strictObject({
        subject: classificationSubjectSchema,
        genreKey: identifier,
      }),
    )
    .max(100),
})

export const classificationBatchSnapshotSchema = z.strictObject({
  contractVersion: z.literal(1),
  targets: z
    .array(
      z.strictObject({
        subject: classificationSubjectSchema,
        // Caller-owned read-state digest: source scope, origin, effective rules, etc.
        stateToken: token,
        // Explanation-only companions to `stateToken`, captured by the owner that
        // holds the reviewed values. A snapshot without them still reviews and
        // executes; its stale outcomes just cannot name the field that moved.
        stateFields: classificationStateFieldsSchema.optional(),
        currentType: sampleType.nullable(),
        assignments: z.array(recognitionTarget).max(1000),
        draftAssignments: z
          .array(classificationProposalTargetSchema)
          .max(200)
          .optional(),
        proposals: z.array(proposal).max(CLASSIFICATION_BATCH_LIMITS.proposals),
        ambiguities: z
          .array(
            z.strictObject({
              reason: z.enum([
                'conflicting-targets',
                'overlapping-phrases',
                'contradictory-type',
              ]),
              dimension,
              targets: z.array(recognitionTarget).min(1).max(100),
              evidence: z
                .array(classificationEvidenceSchema.options[0])
                .min(1)
                .max(1000),
            }),
          )
          .max(1000),
      }),
    )
    .max(CLASSIFICATION_BATCH_LIMITS.targets),
})

export const classificationRejectionSchema = z.strictObject({
  contractVersion: z.literal(1),
  subject: classificationSubjectSchema,
  target: classificationRecognitionTargetSchema,
  // Scoped to stable classification identity, not its current name or aliases.
  evidenceKeys: z.array(token).min(1).max(1000),
})

export const classificationRejectionsSchema = z
  .array(classificationRejectionSchema)
  .max(CLASSIFICATION_BATCH_LIMITS.evidence)

export const classificationRejectionForgetSchema = z.strictObject({
  subject: classificationSubjectSchema,
  target: classificationRecognitionTargetSchema,
})

const reviewReference = {
  reviewId: opaqueId,
  revision: z.int().positive(),
  token,
}

export const classificationDecisionsSchema = z.strictObject({
  ...reviewReference,
  choices: z
    .array(
      z.strictObject({
        proposalKey: token,
        decision: z.enum(['accept', 'reject', 'unreviewed']),
      }),
    )
    .min(1)
    .max(CLASSIFICATION_BATCH_LIMITS.decisions),
})

export const classificationAcceptAllSchema = z.strictObject(reviewReference)

export const classificationReviewRowSchema = proposal.extend({
  proposalKey: token,
  subject: classificationSubjectSchema,
  stateToken: token,
  currentType: sampleType.nullable(),
  replacesType: z.boolean(),
  evidenceKeys: z.array(token).min(1).max(1000),
  remembered: z.boolean(),
  reviewable: z.boolean(),
  assigned: z.boolean(),
  draftAssigned: z.boolean().optional(),
  decision: z.enum(['accept', 'reject', 'unreviewed']),
})

export const classificationBatchDraftSchema = z.strictObject({
  ...reviewReference,
  contractVersion: z.literal(1),
  explicitAssignments: z
    .array(
      z.strictObject({
        subject: classificationSubjectSchema,
        assignments: z.array(classificationProposalTargetSchema).max(200),
      }),
    )
    .max(CLASSIFICATION_BATCH_LIMITS.targets)
    .optional(),
  dependenciesSatisfied: z.boolean(),
  dependencyBlocks: z
    .array(
      z.strictObject({
        proposalKey: token,
        dependency: proposal.shape.dependencies.element,
      }),
    )
    .max(CLASSIFICATION_BATCH_LIMITS.proposals * 100),
  decisions: z
    .array(classificationReviewRowSchema)
    .max(CLASSIFICATION_BATCH_LIMITS.proposals)
    .refine((rows) => rows.every((row) => row.decision !== 'unreviewed')),
  rejectionChanges: z.strictObject({
    remember: z
      .array(classificationRejectionSchema)
      .max(CLASSIFICATION_BATCH_LIMITS.proposals),
    forget: z
      .array(classificationRejectionForgetSchema)
      .max(CLASSIFICATION_BATCH_LIMITS.proposals),
  }),
})

export const classificationReviewPageSchema = z.strictObject({
  ...reviewReference,
  offset: z.int().nonnegative().default(0),
  limit: z.int().min(1).max(CLASSIFICATION_BATCH_LIMITS.page).default(50),
})

// A page carries its complete review reference, so a renderer rejects a stale
// review before trusting any row.
const reviewPage = {
  ...reviewReference,
  total: z.int().nonnegative(),
  nextOffset: z.int().nonnegative().nullable(),
}

export const classificationReviewSummarySchema = z.strictObject({
  ...reviewReference,
  contractVersion: z.literal(1),
  targets: z.int().nonnegative(),
  proposals: z.int().nonnegative(),
  reviewable: z.int().nonnegative(),
  remembered: z.int().nonnegative(),
  ambiguities: z.int().nonnegative(),
  requiredCreations: z.int().nonnegative(),
  typeReplacements: z.int().nonnegative(),
  accepted: z.int().nonnegative(),
  rejected: z.int().nonnegative(),
})

export const classificationProposalPageSchema = z.strictObject({
  ...reviewPage,
  items: z.array(classificationReviewRowSchema),
})

export const classificationAmbiguityRowSchema = z.strictObject({
  subject: classificationSubjectSchema,
  ...classificationBatchSnapshotSchema.shape.targets.element.shape.ambiguities
    .element.shape,
})

export const classificationAmbiguityPageSchema = z.strictObject({
  ...reviewPage,
  items: z.array(classificationAmbiguityRowSchema),
})

export type ClassificationSubject = z.infer<typeof classificationSubjectSchema>
export type ClassificationReviewRow = z.infer<
  typeof classificationReviewRowSchema
>
export type ClassificationBatchDraft = z.infer<
  typeof classificationBatchDraftSchema
>
export type ClassificationProposalTarget = z.infer<
  typeof classificationProposalTargetSchema
>
export type ClassificationBatchSnapshot = z.infer<
  typeof classificationBatchSnapshotSchema
>
export type ClassificationRejection = z.infer<
  typeof classificationRejectionSchema
>
export type ClassificationRejectionForget = z.infer<
  typeof classificationRejectionForgetSchema
>
export type ClassificationRecognitionTarget = z.infer<
  typeof classificationRecognitionTargetSchema
>
export type ClassificationDecisionRequest = z.infer<
  typeof classificationDecisionsSchema
>
export type ClassificationReviewReference = z.infer<
  typeof classificationAcceptAllSchema
>

export type ClassificationReviewSummary = ClassificationReviewReference & {
  contractVersion: 1
  targets: number
  proposals: number
  reviewable: number
  remembered: number
  ambiguities: number
  requiredCreations: number
  typeReplacements: number
  accepted: number
  rejected: number
}

export type ClassificationReviewPage<T> = ClassificationReviewReference & {
  items: T[]
  total: number
  nextOffset: number | null
}

export type ClassificationAmbiguityRow =
  ClassificationBatchSnapshot['targets'][number]['ambiguities'][number] & {
    subject: ClassificationSubject
  }
