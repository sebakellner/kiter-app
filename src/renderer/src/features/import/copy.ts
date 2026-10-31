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

// Conflicts stay undecided until the surface can resolve them per Sample, so the
// message names the count instead of choosing a resolution.
export function conflictMessage(conflictCount: number): string {
  const samples = conflictCount === 1 ? 'Sample conflicts' : 'Samples conflict'
  return (
    `${conflictCount} ${samples} with their current origin. Conflicts are not ` +
    'resolved in this version, so this Pack cannot be created.'
  )
}
