import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { DIALOG_CHANNELS, LIBRARY_CHANNELS, type Api } from '@shared/ipc'
import { isFolderSelection } from '@shared/ipc/dialog'
import { isAudioSamples, isAudioDragError, isFavoriteState } from '@shared/ipc/library'
import { requireIpcResult } from '@shared/ipc/result'

// Custom APIs for renderer
const api: Api = {
  dialog: {
    openFolder: async () =>
      requireIpcResult(await ipcRenderer.invoke(DIALOG_CHANNELS.openFolder), isFolderSelection)
  },
  library: {
    importFolder: async (directory) =>
      requireIpcResult(
        await ipcRenderer.invoke(LIBRARY_CHANNELS.importFolder, { directory }),
        isAudioSamples
      ),
    setFavorite: async (id, favorite) =>
      requireIpcResult(
        await ipcRenderer.invoke(LIBRARY_CHANNELS.setFavorite, { id, favorite }),
        isFavoriteState
      ),
    startDrag: (audioUrl) => ipcRenderer.send(LIBRARY_CHANNELS.startDrag, audioUrl),
    onDragError: (listener) => {
      const handler = (_event: IpcRendererEvent, error: unknown): void => {
        if (!isAudioDragError(error)) {
          console.error('Invalid drag error event:', 'PROTOCOL_ERROR')
          return
        }
        listener(error)
      }
      ipcRenderer.on(LIBRARY_CHANNELS.dragError, handler)
      return () => {
        ipcRenderer.removeListener(LIBRARY_CHANNELS.dragError, handler)
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
