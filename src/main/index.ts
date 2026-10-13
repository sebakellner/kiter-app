import { app, BrowserWindow, ipcMain, protocol } from 'electron'
import { registerIpc } from './ipc'
import { registerAudioProtocol } from './services/audio'

import { createWindow } from './window'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { join } from 'node:path'
import { Catalog } from './services/catalog'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'sample',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true
    }
  }
])

app.whenReady().then(() => {
  const catalog = new Catalog(join(app.getPath('userData'), 'catalog.sqlite'))
  let shutdown = false
  app.on('before-quit', (event) => {
    if (shutdown) return
    event.preventDefault()
    shutdown = true
    void catalog
      .close()
      .catch(() => {
        console.error('Catalog shutdown failed')
      })
      .finally(() => app.quit())
  })
  electronApp.setAppUserModelId('com.electron')
  registerAudioProtocol()
  registerIpc(catalog)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
