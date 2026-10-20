import { z } from 'zod'
import { isEntityId, requirePresentationName } from '../../domain/validation.ts'
import { requireDescription } from '../../domain/presentation.ts'

export const collectionCreateSchema = z.object({
  name: z.string().superRefine((value, context) => {
    try {
      requirePresentationName(value)
    } catch (error) {
      context.addIssue({
        code: 'custom',
        message: error instanceof Error ? error.message : 'Invalid name.',
      })
    }
  }),
  description: z
    .string()
    .superRefine((value, context) => {
      try {
        requireDescription(value)
      } catch (error) {
        context.addIssue({
          code: 'custom',
          message:
            error instanceof Error ? error.message : 'Invalid description.',
        })
      }
    })
    .nullable()
    .optional(),
})

export const collectionGetSchema = z.object({
  id: z.string().refine(isEntityId, 'Invalid Collection identifier.'),
})

export const collectionUpdateSchema = collectionCreateSchema.extend({
  id: collectionGetSchema.shape.id,
  expected: collectionCreateSchema.extend({
    description: collectionCreateSchema.shape.description.unwrap(),
  }),
})

export const collectionRemovalSchema = collectionGetSchema.extend({
  token: z.string().regex(/^[a-f0-9]{64}$/u, 'Review the Collection again.'),
})

export const collectionMembershipSchema = z.object({
  collectionId: collectionGetSchema.shape.id,
  sampleId: z.string().refine(isEntityId, 'Invalid Sample identifier.'),
  assigned: z.boolean(),
})

export const collectionOrderTokenSchema = z
  .string()
  .regex(
    /^[a-f0-9]{64}$/u,
    'Reload the Collection order before moving a Sample.',
  )

export const collectionMoveSchema = collectionMembershipSchema
  .omit({ assigned: true })
  .extend({
    direction: z.enum(['up', 'down']),
    token: collectionOrderTokenSchema,
  })

export const collectionPlaceSchema = collectionMoveSchema
  .omit({ direction: true })
  .extend({
    targetSampleId: collectionMembershipSchema.shape.sampleId,
    placement: z.enum(['before', 'after']),
  })

export const collectionDestinationsSchema = z.object({
  sampleId: collectionMembershipSchema.shape.sampleId,
  search: z
    .string()
    .max(120, 'Use at most 120 characters to search.')
    .refine(
      (value) => !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value),
      'Search cannot contain control characters.',
    )
    .optional(),
})
