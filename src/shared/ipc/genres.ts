import type { z } from 'zod'
import type { Genre } from '../domain/recognition.ts'
import type { Page } from '../domain/pagination.ts'
import {
  requireClassificationName,
  requireClassificationPage,
} from '../domain/classification.ts'
import type { ClassificationPageRequest } from '../domain/classification.ts'
import { requirePage } from '../domain/pagination.ts'
import {
  DomainValidationError,
  isEntityId,
  isRecord,
} from '../domain/validation.ts'
import {
  sampleGenresRequestSchema,
  sampleGenresSaveSchema,
} from '../features/classification/schemas.ts'
import type { IpcResult } from './result.ts'

export const GENRE_CHANNELS = {
  list: 'genres:list',
  readSample: 'genres:read-sample',
  saveSample: 'genres:save-sample',
} as const

export type SampleGenresRequest = z.infer<typeof sampleGenresRequestSchema>
export type SampleGenresSaveRequest = z.infer<typeof sampleGenresSaveSchema>
export type SampleGenresSnapshot = {
  sampleId: string
  token: string
  genres: Genre[]
}

export interface GenresApi {
  list: (request?: ClassificationPageRequest) => Promise<IpcResult<Page<Genre>>>
  readSample: (
    request: SampleGenresRequest,
  ) => Promise<IpcResult<SampleGenresSnapshot>>
  saveSample: (
    request: SampleGenresSaveRequest,
  ) => Promise<IpcResult<SampleGenresSnapshot>>
}

export function requireGenreListRequest(
  value: unknown,
): ClassificationPageRequest {
  return requireClassificationPage(value)
}

export function requireSampleGenresRequest(
  value: unknown,
): SampleGenresRequest {
  const parsed = sampleGenresRequestSchema.safeParse(value)
  if (!parsed.success) {
    throw new DomainValidationError('Invalid Sample Genres request.')
  }
  return parsed.data
}

export function requireSampleGenresSaveRequest(
  value: unknown,
): SampleGenresSaveRequest {
  const parsed = sampleGenresSaveSchema.safeParse(value)
  if (!parsed.success) {
    throw new DomainValidationError('Invalid Sample Genres save request.')
  }
  return parsed.data
}

function isGenre(value: unknown): value is Genre {
  if (!isRecord(value) || !isEntityId(value.id)) {
    return false
  }
  try {
    return value.name === requireClassificationName(value.name)
  } catch {
    return false
  }
}

export function isGenrePage(value: unknown): value is Page<Genre> {
  if (!isRecord(value)) {
    return false
  }
  try {
    const { limit, offset } = requirePage(value)
    return (
      value.limit === limit &&
      value.offset === offset &&
      typeof value.total === 'number' &&
      Number.isSafeInteger(value.total) &&
      value.total >= 0 &&
      Array.isArray(value.items) &&
      value.items.every(isGenre) &&
      value.items.length <= limit &&
      value.items.length <= Math.max(0, value.total - offset)
    )
  } catch {
    return false
  }
}

export function isSampleGenresSnapshot(
  value: unknown,
): value is SampleGenresSnapshot {
  return (
    isRecord(value) &&
    isEntityId(value.sampleId) &&
    typeof value.token === 'string' &&
    /^[a-f0-9]{64}$/u.test(value.token) &&
    Array.isArray(value.genres) &&
    value.genres.length <= 1000 &&
    value.genres.every(isGenre) &&
    new Set(value.genres.map(({ id }) => id)).size === value.genres.length
  )
}
