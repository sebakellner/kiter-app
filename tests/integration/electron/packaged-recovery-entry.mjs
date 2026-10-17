// Included only in the disposable smoke-test copy of the packaged application.
import { app, dialog, BrowserWindow } from 'electron'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { createRequire } from 'node:module'

if (!process.env.KITER_PACKAGED_SMOKE_DATA) {
  throw new Error('Missing isolated packaged smoke storage')
}
app.setPath('userData', process.env.KITER_PACKAGED_SMOKE_DATA)
globalThis.packagedSmoke = { dialogs: [], selection: null }
let alternateSelected = false
dialog.showOpenDialog = async () => ({
  canceled: globalThis.packagedSmoke.selection === null,
  filePaths:
    globalThis.packagedSmoke.selection === null
      ? []
      : [globalThis.packagedSmoke.selection],
})
dialog.showErrorBox = (title, message) => {
  globalThis.packagedSmoke.dialogs.push({ title, message })
}
dialog.showMessageBox = async (options) => {
  globalThis.packagedSmoke.dialogs.push(options)
  if (globalThis.packagedSmoke.dialogs.length > 6) {
    throw new Error(
      'Packaged recovery did not settle after the expected dialogs',
    )
  }
  if (options.title === 'Restore library backup') {
    return { response: 1 }
  }
  if (process.env.KITER_PACKAGED_SMOKE_BACKUP_DIRECTORY && !alternateSelected) {
    alternateSelected = true
    globalThis.packagedSmoke.selection =
      process.env.KITER_PACKAGED_SMOKE_BACKUP_DIRECTORY
    return { response: 1 }
  }
  if (process.env.KITER_PACKAGED_SMOKE_RESTORE) {
    globalThis.packagedSmoke.selection =
      process.env.KITER_PACKAGED_SMOKE_RESTORE
    return { response: 2 }
  }
  return { response: 3 }
}
app.on('browser-window-created', (_, window) => {
  window.webContents.setBackgroundThrottling(false)
})

// Inspection/fixture writes use the actual packaged worker, native SQLite and
// migration assets. Call only after the application's worker has shut down.
globalThis.packagedSmoke.request = async (commands) => {
  const worker = new Worker(
    path.join(app.getAppPath(), 'out/main/dbWorker.js'),
    {
      workerData: {
        filename: path.join(app.getPath('userData'), 'db/kiter.sqlite'),
        migrationsFolder: path.join(app.getAppPath(), 'out/main/migrations'),
      },
    },
  )
  const replies = []
  let index = 0
  return new Promise((resolve, reject) => {
    worker.on('error', reject)
    worker.on('message', (reply) => {
      if (reply.action === 'fatal' || reply.action === 'error') {
        reject(new Error(JSON.stringify(reply)))
        worker.terminate()
      } else if (reply.action === 'close') {
        worker.once('exit', () => resolve(replies))
      } else {
        if (reply.action !== 'ready') {
          replies.push(reply)
        }
        const command = commands[index++] ?? { action: 'close' }
        worker.postMessage({ ...command, requestId: index })
      }
    })
  })
}

if (process.env.KITER_PACKAGED_SMOKE_INSPECT) {
  app.whenReady().then(() => {
    const window = new BrowserWindow({ show: false })
    window.loadURL('about:blank')
  })
} else {
  createRequire(import.meta.url)('./out/main/index.js')
}
