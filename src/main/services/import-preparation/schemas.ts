import { z } from 'zod'
import { importCandidateSnapshotSchema } from '../../../shared/features/imports/schemas.ts'
import { isDiscoveredAudioFile } from '../../../shared/domain/source.ts'
import { PREPARATION_LIMITS } from './types.ts'
import { IMPORT_PREPARATION_MAX_ROOTS } from '../../../shared/features/imports/schemas.ts'
import {
  classificationDecisionsSchema,
  classificationBatchSnapshotSchema,
  classificationReviewRowSchema,
} from '../../../shared/features/classification/batch-schemas.ts'

export const spooledCandidateSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/u),
  file: z.custom<
    import('../../../shared/domain/source.ts').DiscoveredAudioFile
  >(isDiscoveredAudioFile),
  occurrences: z
    .array(z.object({ rootId: z.string().uuid(), relativePath: z.string() }))
    .max(IMPORT_PREPARATION_MAX_ROOTS),
  catalog: importCandidateSnapshotSchema,
})

export const candidatePageRequestSchema = z.object({
  preparationId: z.string().uuid(),
  revision: z.number().int().positive(),
  cursor: z.string().min(1).max(1024).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

export const cursorSchema = z.object({
  preparationId: z.string().uuid(),
  revision: z.number().int().positive(),
  offset: z.number().int().nonnegative().max(PREPARATION_LIMITS.candidates),
  kind: z.enum(['candidates', 'review']),
  reviewToken: z.string().max(128).optional(),
})

export const reviewPageRequestSchema = candidatePageRequestSchema
  .extend({
    reviewToken: z.string().min(1).max(128),
  })
  .strict()

export const preparationRequestSchema = z.object({
  preparationId: z.string().uuid(),
  revision: z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER - 1),
})

const candidateId = z.string().regex(/^[a-f0-9]{64}$/u)
export const selectionRequestSchema = preparationRequestSchema
  .extend({
    choices: z
      .array(z.object({ candidateId, selected: z.boolean() }).strict())
      .min(1)
      .max(100),
  })
  .strict()

export const subtreeRequestSchema = preparationRequestSchema
  .extend({
    rootId: z.string().uuid(),
    relativePath: z
      .string()
      .max(32768)
      .refine((value) => !value.includes('\0')),
    selected: z.boolean(),
  })
  .strict()

export const modeRequestSchema = preparationRequestSchema
  .extend({
    mode: z.enum(['standalone', 'pack']),
  })
  .strict()

export const destinationsRequestSchema = preparationRequestSchema
  .extend({
    choices: z
      .array(
        z
          .object({ candidateId, destinationRootId: z.string().uuid() })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()

export const originDecisionsRequestSchema = preparationRequestSchema
  .extend({
    choices: z
      .array(
        z
          .object({
            candidateId,
            destinationRootId: z.string().uuid(),
            resolution: z.enum(['keep', 'assign']),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()

export const rootRequestSchema = preparationRequestSchema
  .extend({
    rootId: z.string().uuid(),
  })
  .strict()

export const packDetailsRequestSchema = rootRequestSchema
  .extend({
    name: z.string(),
    description: z.string().nullable().optional(),
  })
  .strict()

export const classificationReferenceSchema = preparationRequestSchema
  .extend({
    classificationToken: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict()
export const classificationPageSchema = classificationReferenceSchema
  .extend({
    kind: z
      .enum(['proposals', 'ambiguities', 'decisions'])
      .default('proposals'),
    offset: z.int().min(0).max(500000).default(0),
    limit: z.int().min(1).max(100).default(50),
  })
  .strict()
export const classificationStageSchema = classificationReferenceSchema
  .extend({
    choices: classificationDecisionsSchema.shape.choices,
  })
  .strict()

export const classificationRecordSchema = z.strictObject({
  id: z.string().regex(/^[a-f0-9]{64}$/u),
  stateToken: z.string().regex(/^[a-f0-9]{64}$/u),
  rows: z
    .array(
      classificationReviewRowSchema.extend({
        fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
      }),
    )
    .max(2000),
  ambiguities:
    classificationBatchSnapshotSchema.shape.targets.element.shape.ambiguities,
  subject:
    classificationBatchSnapshotSchema.shape.targets.element.shape.subject,
})
