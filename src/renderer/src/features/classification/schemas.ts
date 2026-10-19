import type { z } from 'zod'
import { sampleCategoriesSaveSchema } from '@shared/features/classification/schemas'

export const sampleCategorySelectionSchema = sampleCategoriesSaveSchema.pick({
  categoryIds: true,
})

export type SampleCategorySelection = z.infer<
  typeof sampleCategorySelectionSchema
>
