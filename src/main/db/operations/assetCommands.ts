import type { AssetRequest, AssetReply } from '../assetProtocol.ts'
import type { AppDatabase } from '../connection.ts'
import * as assets from './assets.ts'
import { updateLocalProfile } from './profile.ts'

export function executeAsset(
  db: AppDatabase,
  request: AssetRequest,
): AssetReply {
  switch (request.action) {
    case 'update-profile':
      return {
        action: request.action,
        result: updateLocalProfile(db, request.input),
      }
    case 'publish-image':
      return {
        action: request.action,
        result: assets.publishImage(db, request.input),
      }
    case 'set-image-reference':
      return {
        action: request.action,
        result: assets.setImageReference(db, request.input),
      }
    case 'get-image':
      return { action: request.action, result: assets.getImage(db, request.id) }
    case 'list-images':
      return {
        action: request.action,
        result: assets.listImages(db, request.after),
      }
    case 'claim-image-cleanup':
      return {
        action: request.action,
        result: assets.claimImageCleanup(db, request.id),
      }
    case 'finish-image-cleanup':
      return {
        action: request.action,
        result: assets.finishImageCleanup(db, request.id),
      }
  }
}
