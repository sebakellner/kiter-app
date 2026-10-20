import type {
  RecognitionDimension,
  RecognitionTarget,
  PathEvidence,
  RecognitionEvidence,
} from '../../../shared/domain/recognition.ts'
export type {
  RecognitionDimension,
  RecognitionTarget,
  PathEvidence,
  RecognitionEvidence,
} from '../../../shared/domain/recognition.ts'

export type RecognitionEntry = {
  target: RecognitionTarget
  name: string
  aliases: readonly string[]
}

export type RecognitionComponent = {
  // Stable occurrence identity shared across overlapping eligible roots.
  occurrence: string
  kind: 'root' | 'folder' | 'filename'
  text: string
  // Distance from the file: filename 0, parent folder 1, etc.; comparable across roots.
  distance: number
  availability: 'observed' | 'cataloged'
}

export type RecognitionInput = {
  kind: 'sample' | 'pack'
  // Only eligible roots and descendants, already scoped by the caller.
  components: readonly RecognitionComponent[]
  packGenres?: readonly { packId: string; genreKey: string }[]
}

export type RecognitionProposal = {
  target: RecognitionTarget
  evidence: RecognitionEvidence[]
}

export type RecognitionAmbiguity = {
  reason: 'conflicting-targets' | 'overlapping-phrases' | 'contradictory-type'
  dimension: RecognitionDimension
  targets: RecognitionTarget[]
  evidence: PathEvidence[]
}

export type RecognitionResult = {
  proposals: RecognitionProposal[]
  ambiguities: RecognitionAmbiguity[]
}
