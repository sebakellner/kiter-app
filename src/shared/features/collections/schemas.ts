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

export const collectionMembershipSchema = z.object({
  collectionId: collectionGetSchema.shape.id,
  sampleId: z.string().refine(isEntityId, 'Invalid Sample identifier.'),
  assigned: z.boolean(),
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
