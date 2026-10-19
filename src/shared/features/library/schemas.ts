import { z } from 'zod'
import { isEntityId } from '../../domain/validation.ts'

export const categoryFilterSchema = z
  .array(z.string().refine(isEntityId))
  .max(100, 'Select at most 100 categories.')
  .refine(
    (ids) => new Set(ids).size === ids.length,
    'Select each category only once.',
  )
