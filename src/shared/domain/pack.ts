import { DomainValidationError, isRecord } from './validation.ts'

export interface Pack {
  id: string
  sourceRootId: string
  name: string
  description: string | null
  coverAssetId: string | null
}

export interface PackUpdateRequest {
  id: string
  name: string
  description?: string | null
}

export interface PackPageRequest {
  limit?: number
  offset?: number
}

export interface PackPage<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

export interface SampleOrigin {
  sampleId: string
  packId: string | null
  originAssignment: 'automatic' | 'manual'
}

export interface PackSample extends SampleOrigin {
  name: string
  path: string
}

export interface PackImportCandidate extends PackSample {
  conflict: boolean
}

export interface PackImportReview {
  sourceRootId: string
  pack: Pack | null
  sampleCount: number
  conflictCount: number
  token: string
}

export interface PackImportRequest {
  sourceRootId: string
  token: string
  name: string
  description?: string | null
  decisions: { sampleId: string; resolution: 'keep' | 'assign' }[]
}

export interface SampleOriginRequest {
  sampleId: string
  packId: string | null
}

export interface PackRemovalReview {
  entity: Pack
  sampleCount: number
  categoryCount: number
  authorCount: number
  token: string
}

export interface PackRemovalRequest {
  id: string
  token: string
}

export function requirePackPage(value: unknown): Required<PackPageRequest> {
  if (!isRecord(value)) {
    throw new DomainValidationError('Invalid Pack page request.')
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
    throw new DomainValidationError('Invalid Pack page request.')
  }
  return { limit, offset }
}
