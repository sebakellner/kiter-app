import type { ImageAsset } from '../../../src/shared/domain/imageAsset.ts'

export function makeImageAsset(
  overrides: Partial<ImageAsset> = {},
): ImageAsset {
  const id = overrides.id ?? '00000000-0000-4000-8000-000000000003'
  return {
    id,
    storageKey: `${id}.png`,
    mimeType: 'image/png',
    width: 1,
    height: 1,
    byteSize: 100,
    state: 'ready',
    ...overrides,
  }
}
