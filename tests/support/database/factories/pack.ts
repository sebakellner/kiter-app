import type { packs } from '../../../../src/main/db/schema/packs.ts'

type PackInsert = typeof packs.$inferInsert

export function makePackInsert(
  id: PackInsert['id'],
  sourceRootId: PackInsert['sourceRootId'],
  overrides: Partial<Omit<PackInsert, 'id' | 'sourceRootId'>> = {},
): PackInsert {
  return { id, sourceRootId, name: 'Origin', ...overrides }
}
