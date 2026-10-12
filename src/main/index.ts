import { app, BrowserWindow, ipcMain, protocol } from 'electron'
import { registerIpc } from './ipc'
import { registerAudioProtocol } from './services/audio'

import { createWindow } from './window'
import { electronApp, optimizer } from '@electron-toolkit/utils'

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
  electronApp.setAppUserModelId('com.electron')
  registerAudioProtocol()
  registerIpc()

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
