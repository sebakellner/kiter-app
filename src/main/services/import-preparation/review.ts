import { createHash } from 'node:crypto'
import {
  DomainValidationError,
  requirePresentationName,
} from '../../../shared/domain/validation.ts'
import { requireDescription } from '../../../shared/domain/presentation.ts'
import { reviewCandidate } from './selection.ts'
import type { PreparationSpool } from './spool.ts'
import type {
  CandidateChoice,
  ImportPreparation,
  PreparationReview,
} from './types.ts'

// Internal selection/origin seal only: not a confirmed plan, execution order,
// classification protocol, filesystem proof, or permission to import.
export async function sealReview(
  summary: ImportPreparation,
  spool: PreparationSpool,
  choices: ReadonlyMap<string, CandidateChoice>,
): Promise<PreparationReview> {
  const hash = createHash('sha256')
  hash.update(
    JSON.stringify({
      contractVersion: 1,
      preparationId: summary.id,
      revision: summary.revision,
      mode: summary.mode,
      roots: summary.roots,
      packDetails: summary.packDetails,
    }),
  )
  let selectedCount = 0
  let conflictCount = 0
  const members = new Set<string>()
  for await (const batch of spool.batches()) {
    for (const item of batch) {
      const candidate = reviewCandidate(summary, item, choices)
      if (candidate.needsSelectionReview) {
        throw new DomainValidationError(
          'Review selection for refreshed candidates, including unchecked files.',
        )
      }
      if (candidate.selected) {
        selectedCount++
        if (summary.mode === 'pack') {
          if (
            !candidate.destinationRootId ||
            (candidate.originConflict && !candidate.originResolution)
          ) {
            throw new DomainValidationError(
              'Resolve every selected overlap destination and origin conflict.',
            )
          }
          if (
            !candidate.originConflict ||
            candidate.originResolution === 'assign'
          ) {
            members.add(candidate.destinationRootId)
          }
        }
        if (candidate.originConflict) {
          conflictCount++
        }
      }
      hash.update('\n')
      hash.update(JSON.stringify(candidate))
    }
  }
  if (selectedCount === 0) {
    throw new DomainValidationError('Select at least one eligible audio file.')
  }
  if (summary.mode === 'pack') {
    const existingPacks = new Set<string>()
    for (const root of summary.roots) {
      const pack = root.catalog?.pack
      if (pack) {
        if (existingPacks.has(pack.id)) {
          throw new DomainValidationError(
            'Grouped multi-root Pack reimport is not supported yet.',
          )
        }
        existingPacks.add(pack.id)
      } else {
        const details = summary.packDetails[root.id]
        requirePresentationName(details?.name)
        requireDescription(details?.description)
        if (!members.has(root.id)) {
          throw new DomainValidationError(
            'Each new Pack needs at least one reviewed prospective member.',
          )
        }
      }
    }
  }
  return {
    contractVersion: 1,
    preparationId: summary.id,
    revision: summary.revision,
    reviewToken: hash.digest('hex'),
    selectedCount,
    conflictCount,
  }
}
