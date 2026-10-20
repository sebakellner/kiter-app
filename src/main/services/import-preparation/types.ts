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
  state: 'ready' | 'blocked'
  // Unique candidates retained in the spool, not a sum of root discoveries.
  candidateCount: number
  roots: PreparationRoot[]
}

// Safety ceilings for the internal prototype, not qualified performance budgets.
export const PREPARATION_LIMITS = {
  candidates: 20_000,
  entries: 200_000,
  depth: 64,
  spoolBytes: 64 * 1024 * 1024,
  issuesPerRoot: 100,
} as const
