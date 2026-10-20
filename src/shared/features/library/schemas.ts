import { z } from 'zod'
import { isEntityId } from '../../domain/validation.ts'
import { sampleTypeSelectionSchema } from '../classification/schemas.ts'
import { MAX_CATALOG_SEARCH_LENGTH, normalizeCatalogSearch } from './search.ts'

export const MAX_CHECKED_SAMPLES = 1000
export const checkedSampleIdsSchema = z
  .array(z.string().refine(isEntityId))
  .min(1)
  .max(MAX_CHECKED_SAMPLES)
  .refine((ids) => new Set(ids).size === ids.length)

export const catalogSearchSchema = z
  .string()
  .max(MAX_CATALOG_SEARCH_LENGTH, 'Use at most 500 characters to search.')
  .refine(
    (value) => !/\p{Cc}/u.test(value.replace(/[\t\n\r]/gu, '')),
    'Search cannot contain control characters.',
  )
  .refine(
    (value) => normalizeCatalogSearch(value).split(' ').length <= 32,
    'Use at most 32 search words.',
  )

export const instrumentFilterSchema = z
  .array(z.string().refine(isEntityId))
  .max(100, 'Select at most 100 instruments.')
  .refine(
    (ids) => new Set(ids).size === ids.length,
    'Select each instrument only once.',
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
