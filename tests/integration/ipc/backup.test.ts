import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { registerHooks } from 'node:module'
import { join } from 'node:path'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import { DbClient } from '../../../src/main/db/client.ts'
import { WorkerTransport } from '../../../src/main/db/client/worker-transport.ts'
import {
  pendingRestoreIntent,
  preserveDamagedCatalog,
} from '../../../src/main/db/runtime/backup.ts'
import {
  BACKUP_CHANNELS,
  isBackupPage,
  isBackupSummary,
  isRestoreTicket,
} from '../../../src/shared/ipc/backup.ts'
import {
  requireIpcResult,
  unwrapIpcResult,
} from '../../../src/shared/ipc/result.ts'
import type { IpcResult } from '../../../src/shared/ipc/result.ts'
import { migrationsFolder } from '../../support/database/connection.ts'
import { createTemporaryDirectory } from '../../support/filesystem/temporary-directory.ts'

// The backup channels are the only renderer-reachable path to an operation that
// replaces a user's library, so this suite drives the real `registerBackupIpc`
// instead of re-creating its wiring. Node cannot import Electron at all, and the
// main-process modules import their shared siblings without extensions, which
// only the bundler resolves; the hooks below supply an `ipcMain` stand-in and
// the extension. Everything else is the production implementation: the
// registrar, `handleResult` authorization, the shared validators, the result
// contract, the DbClient and the database worker.
const listeners = new Map<string, unknown>()
Object.assign(globalThis, {
  __kiterElectron: {
    ipcMain: {
      handle: (channel: string, listener: unknown): void => {
        listeners.set(channel, listener)
      },
    },
    BrowserWindow: { fromWebContents: (): unknown => ({ owner: true }) },
  },
})

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'electron') {
      return { url: 'kiter:electron', shortCircuit: true }
    }
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (!specifier.startsWith('.')) {
        throw error
      }
      return nextResolve(`${specifier}.ts`, context)
    }
  },
  load(url, context, nextLoad) {
    if (url === 'kiter:electron') {
      return {
        format: 'module',
        shortCircuit: true,
        source:
          'const stub = globalThis.__kiterElectron; export const ipcMain = stub.ipcMain; export const BrowserWindow = stub.BrowserWindow',
      }
    }
    return nextLoad(url, context)
  },
})

const { registerBackupIpc } = await import('../../../src/main/ipc/backup.ts')

// A reply crosses to the renderer as an envelope and the renderer validates it
// with the production helpers before reading it, so a shape that does not match
// its own contract fails here as PROTOCOL_ERROR instead of reaching a surface.
function reply<T>(
  result: IpcResult<unknown>,
  isData: (value: unknown) => value is T,
): T {
  return unwrapIpcResult(requireIpcResult(result, isData))
}

type Channel = (
  channel: string,
  request?: unknown,
  event?: unknown,
) => Promise<IpcResult<unknown>>

interface Boundary {
  channel: Channel
  calls: string[]
  directory: string
  filename: string
  storage: { backupDirectory: string; imagesDirectory: string }
}

function mainFrameEvent(): unknown {
  const frame = {}
  return {
    sender: { isDestroyed: () => false, mainFrame: frame },
    senderFrame: frame,
  }
}

function destroyedSenderEvent(): unknown {
  return { sender: { isDestroyed: () => true }, senderFrame: {} }
}

function subframeEvent(): unknown {
  return {
    sender: { isDestroyed: () => false, mainFrame: {} },
    senderFrame: {},
  }
}

async function boundary(t: TestContext): Promise<Boundary> {
  const directory = await createTemporaryDirectory(t, 'backup-ipc')
  const filename = join(directory.path, 'catalog.sqlite')
  const storage = {
    backupDirectory: join(directory.path, 'backups'),
    imagesDirectory: join(directory.path, 'library', 'images'),
  }
  const transport = await WorkerTransport.open(filename, {
    workerPath: new URL(
      '../../../src/main/db/worker/entry.ts',
      import.meta.url,
    ),
    migrationsFolder,
    ...storage,
  })
  const database = DbClient.fromTransport(transport)
  directory.beforeRemove(() => database.close())
  const calls: string[] = []
  // The registered handlers are the only way into a database method from this
  // suite, so recording them here is what shows a refused request never reaches
  // the worker.
  const watched = new Proxy(database, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver)
      if (typeof value !== 'function') {
        return value
      }
      return (...args: unknown[]): unknown => {
        calls.push(String(property))
        return (value as (...input: unknown[]) => unknown).apply(target, args)
      }
    },
  })
  listeners.clear()
  registerBackupIpc(watched)
  return {
    channel: async (channel, request, event = mainFrameEvent()) => {
      const listener = listeners.get(channel) as
        | ((event: unknown, request: unknown) => Promise<IpcResult<unknown>>)
        | undefined
      assert.ok(listener, `${channel} is registered`)
      return listener(event, request)
    },
    calls,
    directory: directory.path,
    filename,
    storage,
  }
}

// A preserved damaged library is the artifact S4 requires: visible for review and
// deletion, never accepted as a copy that may be restored.
async function writeDamagedArtifact(backup: Boundary): Promise<string> {
  const broken = join(backup.directory, 'unreadable.sqlite')
  await writeFile(broken, 'not a database')
  return preserveDamagedCatalog(broken, backup.storage)
}

test('a valid backup request reaches the database worker and answers its contract shape', async (t) => {
  const backup = await boundary(t)

  const summary = reply(
    await backup.channel(BACKUP_CHANNELS.create),
    isBackupSummary,
  )
  assert.equal(summary.kind, 'manual')
  assert.equal(summary.restorable, true)
  assert.equal(summary.totalBytes, summary.catalogBytes + summary.imageBytes)

  const listed = reply(
    await backup.channel(BACKUP_CHANNELS.list, {}),
    isBackupPage,
  )
  assert.equal(listed.total, 1)
  assert.deepEqual(listed.items, [summary])
  assert.deepEqual(backup.calls, ['createBackup', 'listBackups'])
})

test('a malformed backup request is refused as invalid input before the worker is called', async (t) => {
  const backup = await boundary(t)
  const pageFailure = {
    ok: false,
    error: {
      code: 'INVALID_INPUT',
      message: 'Invalid backup page request.',
    },
  }
  const locationFailure = {
    ok: false,
    error: {
      code: 'INVALID_INPUT',
      message:
        'Invalid backup location. Reload the backup list before trying again.',
    },
  }

  for (const request of [{ limit: 0 }, { limit: '10' }, { offset: -1 }, []]) {
    assert.deepEqual(
      await backup.channel(BACKUP_CHANNELS.list, request),
      pageFailure,
    )
  }
  for (const channel of [BACKUP_CHANNELS.delete, BACKUP_CHANNELS.restore]) {
    for (const request of [
      undefined,
      {},
      { location: '' },
      { location: 42 },
      { location: 'line\nbreak' },
    ]) {
      assert.deepEqual(await backup.channel(channel, request), locationFailure)
    }
  }
  assert.deepEqual(backup.calls, [])
})

test('a refused backup command answers with its code and message, never a filesystem error', async (t) => {
  const backup = await boundary(t)
  const outside = join(backup.directory, 'not-a-backup')
  await mkdir(outside)

  assert.deepEqual(
    await backup.channel(BACKUP_CHANNELS.delete, { location: outside }),
    {
      ok: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'That folder is not a managed Kiter backup.',
      },
    },
  )
  assert.equal(existsSync(outside), true)
  assert.deepEqual(
    await backup.channel(BACKUP_CHANNELS.delete, {
      location: join(backup.storage.backupDirectory, 'absent'),
    }),
    {
      ok: false,
      error: { code: 'NOT_FOUND', message: 'That backup no longer exists.' },
    },
  )
})

test('a preserved damaged artifact is listed as not restorable and refused by restore', async (t) => {
  const backup = await boundary(t)
  const artifact = await writeDamagedArtifact(backup)

  const listed = reply(
    await backup.channel(BACKUP_CHANNELS.list, {}),
    isBackupPage,
  )
  const damaged = listed.items.find((item) => item.kind === 'damaged')
  assert.ok(damaged)
  assert.equal(damaged.location, artifact)
  assert.equal(damaged.restorable, false)
  assert.equal(damaged.schemaVersion, 0)

  assert.deepEqual(
    await backup.channel(BACKUP_CHANNELS.restore, {
      location: damaged.location,
    }),
    {
      ok: false,
      error: {
        code: 'INVALID_INPUT',
        message:
          'That folder preserves a damaged library and cannot be restored.',
      },
    },
  )
  // A refused restore changed nothing, so no replacement is pending.
  assert.equal(existsSync(pendingRestoreIntent(backup.filename)), false)
})

test('restore through the boundary reports the restart phase instead of a finished restore', async (t) => {
  const backup = await boundary(t)
  const summary = reply(
    await backup.channel(BACKUP_CHANNELS.create),
    isBackupSummary,
  )

  const ticket = reply(
    await backup.channel(BACKUP_CHANNELS.restore, {
      location: summary.location,
    }),
    isRestoreTicket,
  )
  assert.deepEqual(ticket, {
    location: summary.location,
    createdAt: summary.createdAt,
    restartRequired: true,
  })
  // Phase one stages the swap; the next bootstrap applies it.
  assert.equal(existsSync(pendingRestoreIntent(backup.filename)), true)
})

test('a sender that is not the main frame cannot reach a backup command', async (t) => {
  const backup = await boundary(t)

  for (const event of [destroyedSenderEvent(), subframeEvent()]) {
    assert.deepEqual(
      await backup.channel(BACKUP_CHANNELS.create, undefined, event),
      {
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized IPC request' },
      },
    )
  }
  assert.deepEqual(backup.calls, [])
})
