import { z } from 'zod'
import { isEntityId } from '../../domain/validation.ts'
import { sampleTypeSelectionSchema } from '../classification/schemas.ts'

export const categoryFilterSchema = z
  .array(z.string().refine(isEntityId))
  .max(100, 'Select at most 100 categories.')
  .refine(
    (ids) => new Set(ids).size === ids.length,
    'Select each category only once.',
  )

export const genreFilterSchema = z
  .array(z.string().refine(isEntityId))
  .max(100, 'Select at most 100 genres.')
  .refine(
    (ids) => new Set(ids).size === ids.length,
    'Select each genre only once.',
  )

export const sampleTypeFilterSchema = z
  .array(sampleTypeSelectionSchema.shape.sampleType)
  .max(3, 'Select at most three Sample types.')
  .refine(
    (types) => new Set(types).size === types.length,
    'Select each Sample type only once.',
  )

export type SampleTypeFilter = z.infer<typeof sampleTypeFilterSchema>
