import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import { isRecord } from '../../../shared/domain/validation.ts'
import { isDbRequest } from '../protocol/messages.ts'
import type { DbReply } from '../protocol/messages.ts'
import { openDatabase } from '../runtime/connection.ts'
import { dbFailure, DbError } from '../errors.ts'
import { dispatchRequest } from './dispatch.ts'
import { restoreBackup } from '../runtime/backup.ts'

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
    !options.migrationsFolder ||
    ['backupDirectory', 'imagesDirectory', 'restoreFrom'].some(
      (key) =>
        options[key] !== undefined &&
        (typeof options[key] !== 'string' || !options[key]),
    )
  ) {
    throw new DbError('INVALID_INPUT', 'Invalid database configuration.')
  }
  mkdirSync(dirname(options.filename), { recursive: true })
  const storage = {
    backupDirectory:
      typeof options.backupDirectory === 'string'
        ? options.backupDirectory
        : join(dirname(options.filename), 'backups'),
    imagesDirectory:
      typeof options.imagesDirectory === 'string'
        ? options.imagesDirectory
        : join(dirname(options.filename), '..', 'library', 'images'),
  }
  if (typeof options.restoreFrom === 'string') {
    restoreBackup(
      options.filename,
      options.restoreFrom,
      options.migrationsFolder,
      storage,
    )
  }
  connection = openDatabase(options.filename, options.migrationsFolder, storage)
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
      if (value.action === 'close') {
        database.close()
        port.postMessage({
          requestId: value.requestId,
          action: 'close',
        } satisfies DbReply)
        port.close()
        return
      }
      reply = dispatchRequest(database.db, value)
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
