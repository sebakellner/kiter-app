import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron'
import { registerIpc } from './ipc'
import { registerAudioProtocol } from './services/audio'

import { createWindow } from './window'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { join } from 'node:path'
import { DbClient } from './db'
import { ManagedImages } from './services/images'

// One owner coordinates publication and startup reconciliation in userData.
const primaryInstance = app.requestSingleInstanceLock()
if (!primaryInstance) {
  app.quit()
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'sample',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
])

app
  .whenReady()
  .then(async () => {
    if (!primaryInstance) {
      return
    }
    const database = await DbClient.open(
      join(app.getPath('userData'), 'db', 'kiter.sqlite'),
    )
    let images: ManagedImages
    try {
      images = await ManagedImages.open(app.getPath('userData'), database)
    } catch (error) {
      await database.close()
      console.error(
        'Managed image storage startup failed',
        error instanceof Error && 'code' in error
          ? error.code
          : 'STORAGE_FAILED',
      )
      throw new Error(
        'Unable to initialize managed image storage. Existing files were preserved.',
      )
    }
    let shutdown = false
    app.on('before-quit', (event) => {
      if (shutdown) {
        return
      }
      event.preventDefault()
      shutdown = true
      void images
        .close()
        .then(() => database.close())
        .catch(() => {
          console.error('Database shutdown failed')
        })
        .finally(() => app.quit())
    })
    const imageRecovery = await images.reconcile().catch(() => {
      throw new Error(
        'Unable to reconcile managed images. Existing references were preserved. Restart Kiter to retry.',
      )
    })
    if (imageRecovery.failures.length > 0) {
      dialog.showErrorBox(
        'Managed images need attention',
        'Some managed images could not be verified or cleaned up. Existing references were preserved. Restart Kiter to retry.',
      )
    }
    electronApp.setAppUserModelId('com.electron')
    registerAudioProtocol()
    registerIpc(database)

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // IPC test
    ipcMain.on('ping', () => console.log('pong'))

    createWindow()

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
  .catch((error: unknown) => {
    console.error('Application database startup failed')
    dialog.showErrorBox(
      'Unable to open Kiter',
      error instanceof Error
        ? error.message
        : 'Unable to initialize the local library.',
    )
    app.quit()
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
