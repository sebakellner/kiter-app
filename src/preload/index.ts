import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC, type Api, type AudioDragError } from '@shared/ipc'

// Custom APIs for renderer
const api: Api = {
  dialog: {
    openFolder: () => ipcRenderer.invoke(IPC.dialog.openFolder)
  },
  library: {
    readDir: (dir) => ipcRenderer.invoke(IPC.library.readDir, dir),
    startDrag: (audioUrl) => ipcRenderer.send(IPC.library.startDrag, audioUrl),
    onDragError: (listener) => {
      const handler = (_event: IpcRendererEvent, error: AudioDragError): void => listener(error)
      ipcRenderer.on(IPC.library.dragError, handler)
      return () => {
        ipcRenderer.removeListener(IPC.library.dragError, handler)
      }
    }
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
