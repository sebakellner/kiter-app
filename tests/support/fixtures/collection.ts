import type { CollectionSummary } from '../../../src/shared/domain/collection.ts'

export function makeCollectionSummary(
  overrides: Partial<CollectionSummary> = {},
): CollectionSummary {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Session Picks',
    description: null,
    coverAssetId: null,
    sampleCount: 0,
    ...overrides,
  }
}
