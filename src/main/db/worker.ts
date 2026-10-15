import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import { isRecord } from '../../shared/domain/validation.ts'
import { isDbRequest } from './protocol.ts'
import type { DbReply } from './protocol.ts'
import { openDatabase } from './connection.ts'
import { dbFailure, DbError } from './errors.ts'
import { importFolder } from './operations/sources.ts'
import { setFavorite } from './operations/samples.ts'
import { readLocalProfile, setPreviewVolume } from './operations/profile.ts'
import { executeClassification } from './operations/classificationCommands.ts'
import { executeCollection } from './operations/collectionCommands.ts'
import { isCollectionRequest } from './collectionProtocol.ts'
import { isPackRequest } from './packProtocol.ts'
import { executePack } from './operations/packCommands.ts'
import { isSampleRequest } from './sampleProtocol.ts'
import { executeSample } from './operations/sampleCommands.ts'
import { isAssetRequest } from './assetProtocol.ts'
import { executeAsset } from './operations/assetCommands.ts'

const port = parentPort
if (!port) {
  throw new Error('Database must run in a worker')
}

let connection: ReturnType<typeof openDatabase> | undefined
try {
  const options: unknown = workerData
  if (
    !isRecord(options) ||
    typeof options.filename !== 'string' ||
    !options.filename ||
    typeof options.migrationsFolder !== 'string' ||
    !options.migrationsFolder
  ) {
    throw new DbError('INVALID_INPUT', 'Invalid database configuration.')
  }
  mkdirSync(dirname(options.filename), { recursive: true })
  connection = openDatabase(options.filename, options.migrationsFolder)
  const database = connection
  port.on('message', (value: unknown) => {
    if (!isDbRequest(value)) {
      console.error('Database protocol failed:', 'PROTOCOL_ERROR')
      port.postMessage({
        action: 'fatal',
        failure: {
          code: 'PROTOCOL_ERROR',
          message: 'Invalid database request.',
        },
      } satisfies DbReply)
      database.close()
      port.close()
      return
    }
    let reply: DbReply
    try {
      switch (value.action) {
        case 'import':
          reply = {
            requestId: value.requestId,
            action: 'import',
            result: importFolder(database.db, value.root, value.files),
          }
          break
        case 'favorite':
          reply = {
            requestId: value.requestId,
            action: 'favorite',
            result: setFavorite(database.db, value.id, value.favorite),
          }
          break
        case 'profile':
          reply = {
            requestId: value.requestId,
            action: 'profile',
            result: readLocalProfile(database.db),
          }
          break
        case 'volume':
          reply = {
            requestId: value.requestId,
            action: 'volume',
            result: setPreviewVolume(database.db, value.volume),
          }
          break
        case 'close':
          database.close()
          port.postMessage({
            requestId: value.requestId,
            action: 'close',
          } satisfies DbReply)
          port.close()
          return
        default:
          reply = {
            requestId: value.requestId,
            ...(isAssetRequest(value)
              ? executeAsset(database.db, value)
              : isSampleRequest(value)
                ? executeSample(database.db, value)
                : isPackRequest(value)
                  ? executePack(database.db, value)
                  : isCollectionRequest(value)
                    ? executeCollection(database.db, value)
                    : executeClassification(database.db, value)),
          }
      }
    } catch (error) {
      const failure = dbFailure(error)
      console.error('Database operation failed:', value.action, failure.code)
      reply = { requestId: value.requestId, action: 'error', failure }
    }
    port.postMessage(reply)
  })
  port.postMessage({ action: 'ready' } satisfies DbReply)
} catch (error) {
  if (connection?.native.open) {
    connection.close()
  }
  const failure = dbFailure(error)
  console.error('Database startup failed:', failure.code)
  port.postMessage({ action: 'fatal', failure } satisfies DbReply)
  port.close()
}
