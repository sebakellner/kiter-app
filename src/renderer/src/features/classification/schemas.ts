import { z } from 'zod'
import {
  sampleCategoriesSaveSchema,
  sampleGenresSaveSchema,
} from '@shared/features/classification/schemas'
export { sampleTypeSelectionSchema } from '@shared/features/classification/schemas'
import type { sampleTypeSelectionSchema } from '@shared/features/classification/schemas'

export type SampleTypeSelection = z.infer<typeof sampleTypeSelectionSchema>

export const sampleCategorySelectionSchema = sampleCategoriesSaveSchema.pick({
  categoryIds: true,
})

export type SampleCategorySelection = z.infer<
  typeof sampleCategorySelectionSchema
>

export const sampleGenreSelectionSchema = sampleGenresSaveSchema.pick({
  genreIds: true,
})

export const classificationSelectionSchemas = {
  category: z.object({ ids: sampleCategorySelectionSchema.shape.categoryIds }),
  genre: z.object({ ids: sampleGenreSelectionSchema.shape.genreIds }),
}

export type ClassificationSelection = z.infer<
  typeof classificationSelectionSchemas.category
>
