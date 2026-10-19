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
