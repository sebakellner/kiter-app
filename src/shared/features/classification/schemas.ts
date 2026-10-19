import { z } from 'zod'
import { isEntityId } from '../../domain/validation.ts'

export const sampleInstrumentsRequestSchema = z.object({
  sampleId: z.string().refine(isEntityId, 'Invalid Sample identifier.'),
})

export const sampleInstrumentsSaveSchema =
  sampleInstrumentsRequestSchema.extend({
    token: z
      .string()
      .regex(/^[a-f0-9]{64}$/u, 'Reload saved instruments before saving.'),
    instrumentIds: z
      .array(z.string().refine(isEntityId, 'Invalid Instrument identifier.'))
      .max(1000, 'Select at most 1,000 instruments.')
      .refine(
        (ids) => new Set(ids).size === ids.length,
        'Select each instrument only once.',
      ),
  })

export const sampleGenresRequestSchema = sampleInstrumentsRequestSchema

export const sampleGenresSaveSchema = sampleGenresRequestSchema.extend({
  token: z
    .string()
    .regex(/^[a-f0-9]{64}$/u, 'Reload saved genres before saving.'),
  genreIds: z
    .array(z.string().refine(isEntityId, 'Invalid Genre identifier.'))
    .max(1000, 'Select at most 1,000 genres.')
    .refine(
      (ids) => new Set(ids).size === ids.length,
      'Select each genre only once.',
    ),
})

export const sampleTypeSelectionSchema = z.object({
  sampleType: z.enum(['loop', 'one-shot', 'unknown']),
})

export const sampleTypeRequestSchema = sampleInstrumentsRequestSchema

export const sampleTypeSaveSchema = sampleTypeRequestSchema.extend({
  token: z
    .string()
    .regex(/^[a-f0-9]{64}$/u, 'Reload saved type before saving.'),
  ...sampleTypeSelectionSchema.shape,
})

export const sampleTypeSnapshotSchema = sampleTypeSaveSchema
