import type {
  CandidateChoice,
  ImportPreparation,
  PreparationCandidate,
  PreparationReview,
  ReviewCandidate,
} from './types.ts'

// Choices are sparse, session-local and capped by the 20,000-candidate ceiling.
// Candidate/source payloads remain on disk and are only read in bounded pages.
export interface PreparationDraft {
  choices: Map<string, CandidateChoice>
  seal: PreparationReview | null
}

export function reviewCandidate(
  summary: ImportPreparation,
  candidate: PreparationCandidate,
  choices: ReadonlyMap<string, CandidateChoice>,
): ReviewCandidate {
  const choice = choices.get(candidate.id)
  const destinationRootIds =
    summary.mode === 'pack'
      ? candidate.occurrences.map((occurrence) => occurrence.rootId)
      : []
  const destinationRootId = destinationRootIds.includes(
    choice?.destinationRootId ?? '',
  )
    ? (choice?.destinationRootId ?? null)
    : destinationRootIds.length === 1
      ? destinationRootIds[0]
      : null
  const destination = summary.roots.find(
    (root) => root.id === destinationRootId,
  )
  const sample = candidate.catalog.sample
  const matchingOrigin = Boolean(
    destination?.catalog?.pack &&
    destination.catalog.pack.id === sample?.packId,
  )
  const originConflict = Boolean(
    destination &&
    sample &&
    !matchingOrigin &&
    (sample.packId !== null || sample.originAssignment === 'manual'),
  )
  return {
    ...candidate,
    selected: !candidate.catalog.excluded && (choice?.selected ?? true),
    needsSelectionReview:
      !candidate.catalog.excluded && (choice?.needsSelectionReview ?? false),
    destinationRootIds,
    destinationRootId,
    originConflict,
    originResolution: originConflict
      ? (choice?.originResolution ?? null)
      : null,
  }
}
