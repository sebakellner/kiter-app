import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron'
import { registerIpc } from './ipc'
import { registerAudioProtocol } from './services/audio'

import { createWindow } from './window'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { openLibrary } from './library-startup'
import { ManagedImages } from './services/images'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

if (import.meta.env.DEV && !app.isPackaged) {
  const profile = resolve(__dirname, '../../.kiter-dev/current')
  mkdirSync(profile, { recursive: true })
  app.setPath('userData', profile)
  app.setPath('sessionData', profile)
}

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
    const database = await openLibrary(app.getPath('userData'))
    if (!database) {
      app.quit()
      return
    }
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
    let quitRequested = false
    app.on('window-all-closed', () => {
      if (quitRequested) {
        app.quit()
      }
    })
    app.on('before-quit', (event) => {
      if (shutdown) {
        return
      }
      event.preventDefault()
      const windows = BrowserWindow.getAllWindows()
      if (windows.length > 0) {
        quitRequested = true
        for (const window of windows) {
          window.close()
        }
        return
      }
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
