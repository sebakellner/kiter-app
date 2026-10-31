// Preparing catalogs a folder before any Pack exists, so the dialog states that
// consequence where the user is about to prepare, not after the fact.
export const PREPARE_CONSEQUENCE_NOTE =
  'Preparing a folder adds its files to your library as Samples. If you cancel ' +
  'after preparing, those Samples stay in your library as standalone Samples. ' +
  'No Packs are created until you confirm.'

// A source root belongs to one Pack, so a folder that already has one cannot
// become a new Pack; its row names the Pack that already holds it.
export function alreadyImportedStatus(packName: string): string {
  return `Already imported as Pack “${packName}”.`
}

export const ALREADY_REGISTERED_REASON =
  'A folder belongs to one Pack, so this folder cannot become a new Pack.'

// A conflicting Sample keeps an origin it already has, so the note names the
// origin the candidate reply carries. The reply has no other Pack's name, so the
// note never invents one.
export function conflictOriginNote(candidate: {
  packId: string | null
  originAssignment: 'automatic' | 'manual'
}): string {
  if (candidate.packId !== null) {
    return 'Already assigned to another Pack.'
  }
  return 'Already kept as a standalone Sample by hand.'
}

export function conflictSummary(conflictCount: number): string {
  const samples = conflictCount === 1 ? 'Sample conflicts' : 'Samples conflict'
  return (
    `${conflictCount} ${samples} with the origin they already have. ` +
    'Choose keep or assign for each one.'
  )
}

// The commit carries one decision per conflicting Sample, so the surface reports
// how many of them are decided and names the decisions still missing.
export function conflictDecidedStatus(decided: number, total: number): string {
  return `${decided} of ${total} conflicting ${
    total === 1 ? 'Sample' : 'Samples'
  } decided.`
}

export function conflictBlockedReason(
  undecided: number,
  total: number,
): string {
  return undecided === 1
    ? `1 of the ${total} conflicting Samples still needs a keep or assign ` +
        'decision.'
    : `${undecided} of the ${total} conflicting Samples still need a keep or ` +
        'assign decision.'
}

// Candidates are paged, so the control states how much of the folder was read
// instead of implying that every conflict is already listed.
export function conflictReadMoreAction(read: number, total: number): string {
  return `Read more Samples (${read} of ${total} read)`
}

export const KEEP_ALL_CONFLICTS = 'Keep all conflicting Samples'

export const ASSIGN_ALL_CONFLICTS =
  'Assign all conflicting Samples to this Pack'

export function keepDecisionAction(name: string): string {
  return `Keep ${name}`
}

export function assignDecisionAction(name: string): string {
  return `Assign ${name} to this Pack`
}
