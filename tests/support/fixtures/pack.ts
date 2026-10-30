import type { Pack } from '../../../src/shared/domain/pack.ts'

export function makePack(overrides: Partial<Pack> = {}): Pack {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    sourceRootId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'Alpha Breaks',
    description: null,
    coverAssetId: null,
    ...overrides,
  }
}
