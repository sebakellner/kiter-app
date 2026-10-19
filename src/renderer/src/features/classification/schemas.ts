import { z } from 'zod'
import {
  sampleInstrumentsSaveSchema,
  sampleGenresSaveSchema,
} from '@shared/features/classification/schemas'
export { sampleTypeSelectionSchema } from '@shared/features/classification/schemas'
import type { sampleTypeSelectionSchema } from '@shared/features/classification/schemas'

export type SampleTypeSelection = z.infer<typeof sampleTypeSelectionSchema>

export const sampleInstrumentSelectionSchema = sampleInstrumentsSaveSchema.pick(
  {
    instrumentIds: true,
  },
)

export type SampleInstrumentSelection = z.infer<
  typeof sampleInstrumentSelectionSchema
>

export const sampleGenreSelectionSchema = sampleGenresSaveSchema.pick({
  genreIds: true,
})

export const classificationSelectionSchemas = {
  instrument: z.object({
    ids: sampleInstrumentSelectionSchema.shape.instrumentIds,
  }),
  genre: z.object({ ids: sampleGenreSelectionSchema.shape.genreIds }),
}

export type ClassificationSelection = z.infer<
  typeof classificationSelectionSchemas.instrument
>
