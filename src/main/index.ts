import { app, BrowserWindow, ipcMain } from 'electron'
import { registerIpc } from './ipc'

import { createWindow } from './window'
import { electronApp, optimizer } from '@electron-toolkit/utils'

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')
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
