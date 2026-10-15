import sharp from 'sharp'
import {
  IMAGE_MAX_BYTES,
  IMAGE_MAX_DIMENSION,
} from '../../../shared/domain/imageAsset.ts'
import type { ImageMimeType } from '../../../shared/domain/imageAsset.ts'
import { DomainValidationError } from '../../../shared/domain/validation.ts'

interface ValidatedImage {
  mimeType: ImageMimeType
  width: number
  height: number
  extension: string
}

export async function validateImage(bytes: Buffer): Promise<ValidatedImage> {
  if (bytes.length === 0 || bytes.length > IMAGE_MAX_BYTES) {
    throw new DomainValidationError('Images must be between 1 byte and 10 MiB.')
  }
  try {
    const image = sharp(bytes, {
      animated: true,
      failOn: 'warning',
      limitInputPixels: IMAGE_MAX_DIMENSION ** 2,
    })
    const metadata = await image.metadata()
    const { width, height, format } = metadata
    if (
      !width ||
      !height ||
      width > IMAGE_MAX_DIMENSION ||
      height > IMAGE_MAX_DIMENSION ||
      (metadata.pages ?? 1) !== 1
    ) {
      throw new Error('Invalid dimensions or animation')
    }
    if (format !== 'png' && format !== 'jpeg' && format !== 'webp') {
      throw new Error('Unsupported image')
    }
    // libvips can expose only the default PNG frame; reject APNG explicitly.
    if (format === 'png') {
      let offset = 8
      while (offset + 12 <= bytes.length) {
        const length = bytes.readUInt32BE(offset)
        if (bytes.toString('ascii', offset + 4, offset + 8) === 'acTL') {
          throw new Error('Animated PNG')
        }
        offset += 12 + length
      }
    }
    await image.raw().toBuffer()
    return {
      mimeType:
        format === 'jpeg'
          ? 'image/jpeg'
          : format === 'png'
            ? 'image/png'
            : 'image/webp',
      width,
      height,
      extension: format === 'jpeg' ? 'jpg' : format,
    }
  } catch {
    throw new DomainValidationError(
      'Choose a valid static PNG, JPEG or WebP image up to 4096 pixels per axis.',
    )
  }
}
