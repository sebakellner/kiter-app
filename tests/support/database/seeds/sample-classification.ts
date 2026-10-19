import type { AppDatabase } from '../../../../src/main/db/runtime/connection.ts'
import {
  createAuthor,
  createInstrument,
  setAuthorAssignment,
  setInstrumentAssignment,
} from '../../../../src/main/db/operations/classification/operations.ts'
import type {
  Author,
  Instrument,
} from '../../../../src/shared/domain/classification.ts'

export function seedSampleClassification(
  db: AppDatabase,
  sampleId: string,
  names: { author?: string; instrument?: string } = {},
): { author: Author; instrument: Instrument } {
  const author = createAuthor(db, { name: names.author ?? 'Artist' })
  const instrument = createInstrument(db, { name: names.instrument ?? 'Drums' })
  const target = { kind: 'sample', id: sampleId } as const
  setAuthorAssignment(db, { id: author.id, target, assigned: true })
  setInstrumentAssignment(db, { id: instrument.id, target, assigned: true })
  return { author, instrument }
}
