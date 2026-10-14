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
