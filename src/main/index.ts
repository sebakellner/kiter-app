import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron'
import { registerIpc } from './ipc'
import { registerAudioProtocol } from './services/audio'

import { createWindow } from './window'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { join } from 'node:path'
import { DbClient } from './db'

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
    const database = await DbClient.open(
      join(app.getPath('userData'), 'db', 'kiter.sqlite'),
    )
    let shutdown = false
    app.on('before-quit', (event) => {
      if (shutdown) {
        return
      }
      event.preventDefault()
      shutdown = true
      void database
        .close()
        .catch(() => {
          console.error('Database shutdown failed')
        })
        .finally(() => app.quit())
    })
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
