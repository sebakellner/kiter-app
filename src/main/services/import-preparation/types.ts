import type { DiscoveredAudioFile } from '../../../shared/domain/source.ts'
import type {
  ImportCandidateSnapshot,
  ImportRootSnapshot,
} from '../../../shared/features/imports/schemas.ts'

export interface PreparationRoot {
  id: string
  location: string
  state: 'completed' | 'blocked'
  catalog: ImportRootSnapshot | null
  // Readable supported files observed in this root, including shared occurrences.
  discoveredCount: number
  skippedSymlinks: number
  issueCount: number
  issues: PreparationIssue[]
}

export interface PreparationIssue {
  code:
    | 'SOURCE_UNREADABLE'
    | 'UNSAFE_LOCATION'
    | 'LIMIT_EXCEEDED'
    | 'SOURCE_CHANGED'
    | 'REGISTRATION_INACTIVE'
    | 'REVIEW_CHANGED'
  relativePath: string
}

export interface PreparationCandidate {
  id: string
  // First discovery observation; SOURCE_CHANGED never silently replaces it.
  file: DiscoveredAudioFile
  occurrences: { rootId: string; relativePath: string }[]
  catalog: ImportCandidateSnapshot
}

export interface ImportPreparation {
  id: string
  revision: number
  state: 'ready' | 'blocked' | 'editing' | 'reviewed'
  // Unique candidates retained in the spool, not a sum of root discoveries.
  candidateCount: number
  roots: PreparationRoot[]
  mode: 'standalone' | 'pack' | null
  packDetails: Record<string, PreparationPackDetails>
}

export interface PreparationPackDetails {
  name: string
  description: string | null
  // A folder-name suggestion can be invalid without blocking draft editing.
  nameIssue?: 'INVALID_NAME'
}

export interface CandidateChoice {
  selected?: boolean
  needsSelectionReview?: boolean
  destinationRootId?: string
  originResolution?: 'keep' | 'assign'
}

export interface ReviewCandidate extends PreparationCandidate {
  selected: boolean
  needsSelectionReview: boolean
  destinationRootIds: string[]
  destinationRootId: string | null
  originConflict: boolean
  originResolution: 'keep' | 'assign' | null
}

export interface PreparationReview {
  contractVersion: 1
  preparationId: string
  revision: number
  reviewToken: string
  selectedCount: number
  conflictCount: number
}

export interface PreparationRequest {
  preparationId: string
  revision: number
}

export interface PreparationPageRequest extends PreparationRequest {
  cursor?: string
  limit?: number
}

export interface PreparationCandidatePage {
  items: ReviewCandidate[]
  total: number
  revision: number
  nextCursor: string | null
}

// Safety ceilings for the internal prototype, not qualified performance budgets.
export const PREPARATION_LIMITS = {
  candidates: 20_000,
  entries: 200_000,
  depth: 64,
  spoolBytes: 64 * 1024 * 1024,
  issuesPerRoot: 100,
} as const
