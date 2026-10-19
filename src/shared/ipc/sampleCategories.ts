import type { Category } from '../domain/classification.ts'
import {
  DomainValidationError,
  isEntityId,
  isRecord,
} from '../domain/validation.ts'
import { isCategory } from './categories.ts'
import type { z } from 'zod'
import {
  sampleCategoriesRequestSchema,
  sampleCategoriesSaveSchema,
} from '../features/classification/schemas.ts'

export type SampleCategoriesRequest = z.infer<
  typeof sampleCategoriesRequestSchema
>
export type SampleCategoriesSnapshot = {
  sampleId: string
  token: string
  categories: Category[]
}
export type SampleCategoriesSaveRequest = z.infer<
  typeof sampleCategoriesSaveSchema
>

export function requireSampleCategoriesRequest(
  value: unknown,
): SampleCategoriesRequest {
  const parsed = sampleCategoriesRequestSchema.safeParse(value)
  if (!parsed.success) {
    throw new DomainValidationError('Invalid Sample Categories request.')
  }
  return parsed.data
}

export function requireSampleCategoriesSaveRequest(
  value: unknown,
): SampleCategoriesSaveRequest {
  const parsed = sampleCategoriesSaveSchema.safeParse(value)
  if (!parsed.success) {
    throw new DomainValidationError('Invalid Sample Categories save request.')
  }
  return parsed.data
}

export function isSampleCategoriesSnapshot(
  value: unknown,
): value is SampleCategoriesSnapshot {
  return (
    isRecord(value) &&
    isEntityId(value.sampleId) &&
    typeof value.token === 'string' &&
    /^[a-f0-9]{64}$/u.test(value.token) &&
    Array.isArray(value.categories) &&
    value.categories.length <= 1000 &&
    value.categories.every(isCategory) &&
    new Set(value.categories.map((category) => category.id)).size ===
      value.categories.length
  )
}
