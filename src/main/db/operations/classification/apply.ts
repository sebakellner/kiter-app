import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../runtime/connection.ts'
import { prepareSampleClassification } from './preparation.ts'
import { requireClassificationApplyRequest } from '../../../../shared/ipc/classification.ts'
import type { ClassificationApplyRequest } from '../../../../shared/ipc/classification.ts'
import { DbError } from '../../errors.ts'
import { recognitionVocabulary } from '../../schema/recognition.ts'
import { samples } from '../../schema/samples.ts'
import { createCategory, setCategoryAssignment } from './operations.ts'
import { createGenre, setGenreAssignment } from './genres.ts'

export function applySampleClassification(
  db: AppDatabase,
  value: ClassificationApplyRequest,
): { sampleId: string } {
  const input = requireClassificationApplyRequest(value)
  return db.transaction(
    () => {
      const first = prepareSampleClassification(db, {
        sampleId: input.sampleId,
        token: input.token,
        limit: 100,
      })
      if (first.total > 2000) {
        throw new DbError(
          'INVALID_INPUT',
          'This Sample exceeds the classification evidence limit.',
        )
      }
      const items = [...first.items]
      for (let offset = 100; offset < first.total; offset += 100) {
        items.push(
          ...prepareSampleClassification(db, {
            sampleId: input.sampleId,
            token: input.token,
            limit: 100,
            offset,
          }).items,
        )
      }
      // Validate the entire requested set before creating vocabulary or assignments.
      const proposals = input.keys.map((key) => {
        const proposal = items.find(
          (item) =>
            item.kind === 'proposal' &&
            item.key === key &&
            !item.alreadyAssigned,
        )
        if (!proposal) {
          throw new DbError(
            'STALE_REVIEW',
            'The requested suggestion is no longer applicable. Refresh suggestions.',
          )
        }
        return proposal
      })
      for (const proposal of proposals) {
        const entry = db
          .select()
          .from(recognitionVocabulary)
          .where(eq(recognitionVocabulary.key, proposal.key))
          .get()!
        const target = { kind: 'sample' as const, id: input.sampleId }
        if (proposal.dimension === 'category') {
          const id =
            entry.categoryId ?? createCategory(db, { name: entry.name }).id
          setCategoryAssignment(db, { id, target, assigned: true })
        } else if (proposal.dimension === 'genre') {
          const id = entry.genreId ?? createGenre(db, { name: entry.name }).id
          setGenreAssignment(db, { id, target, assigned: true })
        } else {
          if (proposal.key !== 'loop' && proposal.key !== 'one-shot') {
            throw new DbError('INVALID_INPUT', 'Invalid Sample type.')
          }
          db.update(samples)
            .set({ sampleType: proposal.key })
            .where(eq(samples.id, input.sampleId))
            .run()
        }
      }
      return { sampleId: input.sampleId }
    },
    { behavior: 'immediate' },
  )
}
