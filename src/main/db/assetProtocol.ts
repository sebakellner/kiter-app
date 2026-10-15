import type {
  ImageAsset,
  ImagePublicationRequest,
  ImageReferenceRequest,
} from '../../shared/domain/imageAsset.ts'
import {
  isImageAsset,
  isImageTarget,
  isNullableAssetId,
} from '../../shared/domain/imageAsset.ts'
import { isEntityId, isRecord } from '../../shared/domain/validation.ts'

export type AssetRequest =
  | { action: 'publish-image'; input: ImagePublicationRequest }
  | { action: 'set-image-reference'; input: ImageReferenceRequest }
  | {
      action: 'get-image' | 'claim-image-cleanup' | 'finish-image-cleanup'
      id: string
    }
  | { action: 'list-images'; after: string | null }

export type AssetReply =
  | { action: 'publish-image'; result: ImageAsset }
  | { action: 'set-image-reference'; result: { assetId: string | null } }
  | { action: 'get-image' | 'claim-image-cleanup'; result: ImageAsset | null }
  | { action: 'finish-image-cleanup'; result: { id: string } }
  | { action: 'list-images'; result: ImageAsset[] }

export function isAssetRequest(value: unknown): value is AssetRequest {
  if (!isRecord(value)) {
    return false
  }
  const input = value.input
  switch (value.action) {
    case 'publish-image':
      return (
        isRecord(input) &&
        isImageTarget(input.target) &&
        isNullableAssetId(input.expectedAssetId) &&
        isImageAsset(input.asset) &&
        input.asset.state === 'ready'
      )
    case 'set-image-reference':
      return (
        isRecord(input) &&
        isImageTarget(input.target) &&
        isNullableAssetId(input.expectedAssetId) &&
        isNullableAssetId(input.assetId)
      )
    case 'get-image':
    case 'claim-image-cleanup':
    case 'finish-image-cleanup':
      return isEntityId(value.id)
    case 'list-images':
      return isNullableAssetId(value.after)
    default:
      return false
  }
}

export function isAssetReply(value: unknown): value is AssetReply {
  if (!isRecord(value)) {
    return false
  }
  switch (value.action) {
    case 'publish-image':
      return isImageAsset(value.result) && value.result.state === 'ready'
    case 'set-image-reference':
      return isRecord(value.result) && isNullableAssetId(value.result.assetId)
    case 'get-image':
    case 'claim-image-cleanup':
      return value.result === null || isImageAsset(value.result)
    case 'finish-image-cleanup':
      return isRecord(value.result) && isEntityId(value.result.id)
    case 'list-images':
      return (
        Array.isArray(value.result) &&
        value.result.length <= 100 &&
        value.result.every(isImageAsset)
      )
    default:
      return false
  }
}
