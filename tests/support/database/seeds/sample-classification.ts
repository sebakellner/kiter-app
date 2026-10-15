import type { AppDatabase } from '../../../../src/main/db/runtime/connection.ts'
import {
  createAuthor,
  createCategory,
  setAuthorAssignment,
  setCategoryAssignment,
} from '../../../../src/main/db/operations/classification/operations.ts'
import type {
  Author,
  Category,
} from '../../../../src/shared/domain/classification.ts'

export function seedSampleClassification(
  db: AppDatabase,
  sampleId: string,
  names: { author?: string; category?: string } = {},
): { author: Author; category: Category } {
  const author = createAuthor(db, { name: names.author ?? 'Artist' })
  const category = createCategory(db, { name: names.category ?? 'Drums' })
  const target = { kind: 'sample', id: sampleId } as const
  setAuthorAssignment(db, { id: author.id, target, assigned: true })
  setCategoryAssignment(db, { id: category.id, target, assigned: true })
  return { author, category }
}
