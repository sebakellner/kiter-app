import { z } from 'zod'
import { isEntityId } from '../../domain/validation.ts'

export const sampleCategoriesRequestSchema = z.object({
  sampleId: z.string().refine(isEntityId, 'Invalid Sample identifier.'),
})

export const sampleCategoriesSaveSchema = sampleCategoriesRequestSchema.extend({
  token: z
    .string()
    .regex(/^[a-f0-9]{64}$/u, 'Reload saved categories before saving.'),
  categoryIds: z
    .array(z.string().refine(isEntityId, 'Invalid Category identifier.'))
    .max(1000, 'Select at most 1,000 categories.')
    .refine(
      (ids) => new Set(ids).size === ids.length,
      'Select each category only once.',
    ),
})
