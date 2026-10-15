export const IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const IMAGE_MAX_DIMENSION = 4096

export type ImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp'

export interface ImageAsset {
  id: string
  storageKey: string
  mimeType: ImageMimeType
  byteSize: number
  width: number
  height: number
  state: 'ready' | 'cleanup_pending'
}

export type ImageTarget =
  { kind: 'pack' | 'collection'; id: string } | { kind: 'profile' }

export interface ImageReferenceRequest {
  target: ImageTarget
  expectedAssetId: string | null
  assetId: string | null
}

export interface ImagePublicationRequest {
  target: ImageTarget
  expectedAssetId: string | null
  asset: ImageAsset
}

export function isImageTarget(value: unknown): value is ImageTarget {
  return (
    isRecord(value) &&
    (value.kind === 'profile' ||
      ((value.kind === 'pack' || value.kind === 'collection') &&
        isEntityId(value.id)))
  )
}

export function isNullableAssetId(value: unknown): value is string | null {
  return value === null || isEntityId(value)
}

export function isImageAsset(value: unknown): value is ImageAsset {
  if (!isRecord(value) || !isEntityId(value.id)) {
    return false
  }
  const extension =
    value.mimeType === 'image/png'
      ? 'png'
      : value.mimeType === 'image/jpeg'
        ? 'jpg'
        : value.mimeType === 'image/webp'
          ? 'webp'
          : null
  return (
    extension !== null &&
    value.storageKey === `${value.id}.${extension}` &&
    typeof value.byteSize === 'number' &&
    Number.isSafeInteger(value.byteSize) &&
    value.byteSize >= 1 &&
    value.byteSize <= IMAGE_MAX_BYTES &&
    typeof value.width === 'number' &&
    Number.isInteger(value.width) &&
    value.width >= 1 &&
    value.width <= IMAGE_MAX_DIMENSION &&
    typeof value.height === 'number' &&
    Number.isInteger(value.height) &&
    value.height >= 1 &&
    value.height <= IMAGE_MAX_DIMENSION &&
    (value.state === 'ready' || value.state === 'cleanup_pending')
  )
}
import { isEntityId, isRecord } from './validation.ts'
