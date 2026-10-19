import { requirePresentationName } from './validation.ts'
import type { SampleSource } from './source.ts'
import { requirePage } from './pagination.ts'
import type { Page, PageRequest } from './pagination.ts'

export type OriginAssignment = 'automatic' | 'manual'

export interface Sample {
  id: string
  displayName: string | null
  notes: string | null
  sampleType: 'loop' | 'one-shot' | null
  favorite: boolean
  packId: string | null
  originAssignment: OriginAssignment
}

export interface SampleUpdateRequest {
  id: string
  displayName?: string | null
  notes?: string | null
}

export type SamplePageRequest = PageRequest

export type SamplePage<T> = Page<T>

export type SampleReferenceKind =
  'collection' | 'instrument' | 'genre' | 'author' | 'root'

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
  instrumentCount: number
  genreCount: number
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
  return requirePage(value, 'Invalid Sample page request.')
}
