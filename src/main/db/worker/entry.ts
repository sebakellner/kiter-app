import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import { isRecord } from '../../../shared/domain/validation.ts'
import { isDbRequest } from '../protocol/messages.ts'
import type { DbReply } from '../protocol/messages.ts'
import { openDatabase } from '../runtime/connection.ts'
import { dbFailure, DbError } from '../errors.ts'
import { dispatchRequest } from './dispatch.ts'
import { applyPendingRestore, restoreBackup } from '../runtime/backup.ts'
import {
  createLibraryBackup,
  restoreLibraryBackup,
} from '../runtime/backup-service.ts'
import {
  deleteLibraryBackup,
  listLibraryBackups,
} from '../runtime/backup-service.ts'

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
  // A restore staged by the previous session completes before the catalog is
  // opened. An unreadable intent is discarded, never allowed to block startup,
  // but a swap that could not be applied has to stop here: serving a session
  // would let the next start discard its work without telling anyone.
  const pendingRestore = applyPendingRestore(options.filename)
  if (pendingRestore === 'failed') {
    throw new DbError(
      'STORAGE_FAILED',
      'A pending library restore could not be applied. Restart Kiter to retry.',
    )
  }
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
  // Only now is the restored catalog known to open and validate.
  if (pendingRestore === 'applied') {
    console.error('Library restore completed:', 'RESTORE_COMPLETE')
  }
  const runtime = {
    native: database.native,
    filename: options.filename,
    migrationsFolder: options.migrationsFolder,
    storage,
  }
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
      switch (value.action) {
        // Backup commands own the catalog file and managed storage, so the
        // worker answers them instead of catalog dispatch.
        case 'create-backup':
          reply = {
            requestId: value.requestId,
            action: value.action,
            result: createLibraryBackup(runtime),
          }
          break
        case 'list-backups':
          reply = {
            requestId: value.requestId,
            action: value.action,
            result: listLibraryBackups(runtime, value.input),
          }
          break
        case 'delete-backup':
          reply = {
            requestId: value.requestId,
            action: value.action,
            result: deleteLibraryBackup(runtime, value.location),
          }
          break
        case 'restore-backup':
          // The swap happens at the next bootstrap, so this reply only confirms
          // the staged replacement.
          reply = {
            requestId: value.requestId,
            action: value.action,
            result: restoreLibraryBackup(runtime, value.location),
          }
          break
        default:
          reply = dispatchRequest(database.db, value)
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
