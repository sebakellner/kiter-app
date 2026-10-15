import type { PackRequest, PackReply } from '../packProtocol.ts'
import type { AppDatabase } from '../connection.ts'
import * as packs from './packs.ts'

export function executePack(db: AppDatabase, request: PackRequest): PackReply {
  switch (request.action) {
    case 'get-pack-source-root':
      return {
        action: request.action,
        result: packs.getPackSourceRoot(db, request.root),
      }
    case 'update-pack':
      return {
        action: request.action,
        result: packs.updatePack(db, request.input),
      }
    case 'get-pack':
      return { action: request.action, result: packs.getPack(db, request.id) }
    case 'list-packs':
      return {
        action: request.action,
        result: packs.listPacks(db, request.input),
      }
    case 'list-pack-samples':
      return {
        action: request.action,
        result: packs.listPackSamples(db, request.id, request.input),
      }
    case 'list-pack-import-candidates':
      return {
        action: request.action,
        result: packs.listPackImportCandidates(db, request.id, request.input),
      }
    case 'review-pack-import':
      return {
        action: request.action,
        result: packs.reviewPackImport(db, request.id),
      }
    case 'import-pack':
      return {
        action: request.action,
        result: packs.importPack(db, request.input),
      }
    case 'get-sample-origin':
      return {
        action: request.action,
        result: packs.getSampleOrigin(db, request.id),
      }
    case 'set-sample-origin':
      return {
        action: request.action,
        result: packs.setSampleOrigin(db, request.input),
      }
    case 'review-pack-removal':
      return {
        action: request.action,
        result: packs.reviewPackRemoval(db, request.id),
      }
    case 'remove-pack':
      return {
        action: request.action,
        result: packs.removePack(db, request.input),
      }
  }
}
