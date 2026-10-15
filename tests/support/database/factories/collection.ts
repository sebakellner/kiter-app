import type { collections } from '../../../../src/main/db/schema/collections.ts'

type CollectionInsert = typeof collections.$inferInsert

export function makeCollectionInsert(
  id: CollectionInsert['id'],
  overrides: Partial<Omit<CollectionInsert, 'id'>> = {},
): CollectionInsert {
  return { id, name: 'Selection', ...overrides }
}
