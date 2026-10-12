import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC, type Api } from '@shared/ipc'

// Custom APIs for renderer
const api: Api = {
  dialog: {
    openFolder: () => ipcRenderer.invoke(IPC.dialog.openFolder)
  },
  library: {
    readDir: (dir) => ipcRenderer.invoke(IPC.library.readDir, dir)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
