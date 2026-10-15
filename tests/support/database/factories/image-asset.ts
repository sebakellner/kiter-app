import type { imageAssets } from '../../../../src/main/db/schema/assets.ts'

type ImageAssetInsert = typeof imageAssets.$inferInsert

export function makeImageAssetInsert(
  id: ImageAssetInsert['id'],
  overrides: Partial<Omit<ImageAssetInsert, 'id'>> = {},
): ImageAssetInsert {
  const mimeType = overrides.mimeType ?? 'image/png'
  const extensions = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
  } as const
  return {
    id,
    storageKey: `${id}.${extensions[mimeType]}`,
    mimeType,
    byteSize: 100,
    width: 1,
    height: 1,
    ...overrides,
  }
}
