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

// Internal draft-review seal, optionally binding spooled classification content.
// Not a confirmed plan, execution order, filesystem proof, or permission to import.
export async function sealReview(
  summary: ImportPreparation,
  spool: PreparationSpool,
  choices: ReadonlyMap<string, CandidateChoice>,
  classificationDigest?: string,
): Promise<PreparationReview> {
  const organizations =
    summary.mode === 'pack' ? (summary.packOrganizations ?? {}) : {}
  if (Object.values(organizations).some((draft) => draft.needsReview)) {
    throw new DomainValidationError(
      'Review stale Pack organization choices first.',
    )
  }
  const organizationDigest = Object.keys(organizations).length
    ? createHash('sha256')
        .update(
          JSON.stringify(
            Object.fromEntries(
              Object.entries(organizations).sort(([a], [b]) =>
                a < b ? -1 : a > b ? 1 : 0,
              ),
            ),
          ),
        )
        .digest('hex')
    : undefined
  const hash = createHash('sha256')
  hash.update(
    JSON.stringify({
      contractVersion: organizationDigest ? 3 : classificationDigest ? 2 : 1,
      organizationDigest,
      classificationDigest,
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
  const result = {
    preparationId: summary.id,
    revision: summary.revision,
    reviewToken: hash.digest('hex'),
    selectedCount,
    conflictCount,
  }
  return organizationDigest
    ? {
        ...result,
        contractVersion: 3,
        organizationDigest,
        ...(classificationDigest ? { classificationDigest } : {}),
      }
    : classificationDigest
      ? { ...result, contractVersion: 2, classificationDigest }
      : { ...result, contractVersion: 1 }
}
