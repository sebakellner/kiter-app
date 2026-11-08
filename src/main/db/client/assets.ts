import type { ClientRequest } from './core.ts'
import type {
  ImageAsset,
  ImagePublicationRequest,
  ImageReferenceRequest,
} from '../../../shared/domain/imageAsset.ts'

export interface AssetsCommands {
  publishImage(input: ImagePublicationRequest): Promise<ImageAsset>
  setImageReference(
    input: ImageReferenceRequest,
  ): Promise<{ assetId: string | null }>
  getImage(id: string): Promise<ImageAsset | null>
  listImages(after?: string | null): Promise<ImageAsset[]>
  claimImageCleanup(id: string): Promise<ImageAsset | null>
  finishImageCleanup(id: string): Promise<{ id: string }>
}

export function assetsCommands(request: ClientRequest): AssetsCommands {
  return {
    async publishImage(input: ImagePublicationRequest): Promise<ImageAsset> {
      return request({ action: 'publish-image', input })
    },

    async setImageReference(
      input: ImageReferenceRequest,
    ): Promise<{ assetId: string | null }> {
      return request({ action: 'set-image-reference', input })
    },

    async getImage(id: string): Promise<ImageAsset | null> {
      return request({ action: 'get-image', id })
    },

    async listImages(after: string | null = null): Promise<ImageAsset[]> {
      return request({ action: 'list-images', after })
    },

    async claimImageCleanup(id: string): Promise<ImageAsset | null> {
      return request({ action: 'claim-image-cleanup', id })
    },

    async finishImageCleanup(id: string): Promise<{ id: string }> {
      return request({ action: 'finish-image-cleanup', id })
    },
  }
}
