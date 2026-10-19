import { requirePage } from './pagination.ts'
import type { Page, PageRequest } from './pagination.ts'

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

export type PackPageRequest = PageRequest

export type PackPage<T> = Page<T>

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
  instrumentCount: number
  genreCount: number
  authorCount: number
  token: string
}

export interface PackRemovalRequest {
  id: string
  token: string
}

export function requirePackPage(value: unknown): Required<PackPageRequest> {
  return requirePage(value, 'Invalid Pack page request.')
}
