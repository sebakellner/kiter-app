import type { PackListItem } from '../../../src/shared/ipc/packs.ts'

export function makePack(overrides: Partial<PackListItem> = {}): PackListItem {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    sourceRootId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'Alpha Breaks',
    description: null,
    coverAssetId: null,
    sourceRootPath: '/library/alpha-breaks',
    ...overrides,
  }
}
