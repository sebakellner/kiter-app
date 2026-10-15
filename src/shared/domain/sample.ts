import {
  DomainValidationError,
  isRecord,
  requirePresentationName,
} from './validation.ts'
import type { SampleSource } from './source.ts'

export type OriginAssignment = 'automatic' | 'manual'

export interface Sample {
  id: string
  displayName: string | null
  notes: string | null
  favorite: boolean
  packId: string | null
  originAssignment: OriginAssignment
}

export interface SampleUpdateRequest {
  id: string
  displayName?: string | null
  notes?: string | null
}

export interface SamplePageRequest {
  limit?: number
  offset?: number
}

export interface SamplePage<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

export type SampleReferenceKind = 'collection' | 'category' | 'author' | 'root'

export interface SampleReference {
  id: string
  name: string
  position: number | null
}

export interface SampleReferencesRequest extends SamplePageRequest {
  id: string
  kind: SampleReferenceKind
}

export interface SampleRemovalReview {
  entity: Sample
  source: SampleSource
  collectionCount: number
  categoryCount: number
  authorCount: number
  rootCount: number
  token: string
}

export interface SampleRemovalRequest {
  id: string
  token: string
}

export interface ExcludedSource {
  canonicalPath: string
}

export interface SourceReinclusionRequest {
  canonicalPath: string
  sourceRootId: string
}

export function requireSampleDisplayName(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null
  }
  // Validate controls before accepting whitespace as a cleared override.
  if (
    typeof value === 'string' &&
    !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value) &&
    !value.trim()
  ) {
    return null
  }
  return requirePresentationName(value)
}

export { requireDescription as requireSampleNotes } from './presentation.ts'

export function requireSamplePage(value: unknown): Required<SamplePageRequest> {
  if (!isRecord(value)) {
    throw new DomainValidationError('Invalid Sample page request.')
  }
  const { limit = 50, offset = 0 } = value
  if (
    typeof limit !== 'number' ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    typeof offset !== 'number' ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    throw new DomainValidationError('Invalid Sample page request.')
  }
  return { limit, offset }
}
