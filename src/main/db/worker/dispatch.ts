import type { AppDatabase } from '../runtime/connection.ts'
import type { DbRequest, DbReply } from '../protocol/messages.ts'
import { isAssetRequest } from '../protocol/assets.ts'
import { isSampleRequest } from '../protocol/samples.ts'
import { isPackRequest } from '../protocol/packs.ts'
import { isCollectionRequest } from '../protocol/collections.ts'
import { importFolder } from '../operations/sources/import.ts'
import { setFavorite } from '../operations/samples/favorites.ts'
import {
  readLocalProfile,
  updateLocalProfile,
  setPreviewVolume,
} from '../operations/profile/operations.ts'
import { executeAsset } from './dispatch/assets.ts'
import { executeSample } from './dispatch/samples.ts'
import { executePack } from './dispatch/packs.ts'
import { executeCollection } from './dispatch/collections.ts'
import { executeClassification } from './dispatch/classification.ts'
import { isRecognitionRequest } from '../protocol/recognition.ts'
import { executeRecognition } from './dispatch/recognition.ts'
import { readImportCatalog } from '../operations/sources/import-snapshot.ts'
import { readImportClassificationContext } from '../operations/classification/import-context.ts'
import { readImportPackOrganizationCatalog } from '../operations/classification/pack-organization.ts'

export function dispatchRequest(
  db: AppDatabase,
  request: Exclude<DbRequest, { action: 'close' }>,
): DbReply {
  const requestId = request.requestId
  switch (request.action) {
    case 'read-import-pack-organization-catalog':
      return {
        requestId,
        action: request.action,
        result: readImportPackOrganizationCatalog(db, request.input),
      }
    case 'read-import-classification-context':
      return {
        requestId,
        action: request.action,
        result: readImportClassificationContext(db, request.input),
      }
    case 'read-import-catalog':
      return {
        requestId,
        action: request.action,
        result: readImportCatalog(db, request.input),
      }
    case 'import':
      return {
        requestId,
        action: request.action,
        result: importFolder(db, request.root, request.files),
      }
    case 'favorite':
      return {
        requestId,
        action: request.action,
        result: setFavorite(db, request.id, request.favorite),
      }
    case 'profile':
      return { requestId, action: request.action, result: readLocalProfile(db) }
    case 'update-profile':
      return {
        requestId,
        action: request.action,
        result: updateLocalProfile(db, request.input),
      }
    case 'volume':
      return {
        requestId,
        action: request.action,
        result: setPreviewVolume(db, request.volume),
      }
    default:
      if (isRecognitionRequest(request)) {
        return { requestId, ...executeRecognition(db, request) }
      }
      if (isAssetRequest(request)) {
        return { requestId, ...executeAsset(db, request) }
      }
      if (isSampleRequest(request)) {
        return { requestId, ...executeSample(db, request) }
      }
      if (isPackRequest(request)) {
        return { requestId, ...executePack(db, request) }
      }
      if (isCollectionRequest(request)) {
        return { requestId, ...executeCollection(db, request) }
      }
      return { requestId, ...executeClassification(db, request) }
  }
}
