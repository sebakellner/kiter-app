import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { DIALOG_CHANNELS, LIBRARY_CHANNELS, type Api } from '@shared/ipc'
import { isFolderSelection } from '@shared/ipc/dialog'
import {
  isAudioSamples,
  isAudioDragError,
  isFavoriteState,
  isLibraryPage,
} from '@shared/ipc/library'
import { requireIpcResult } from '@shared/ipc/result'
import { isSampleCategoriesSnapshot } from '@shared/ipc/sampleCategories'
import { isSampleTypeSnapshot } from '@shared/ipc/sampleType'
import {
  GENRE_CHANNELS,
  isGenrePage,
  isSampleGenresSnapshot,
} from '@shared/ipc/genres'
import { LIFECYCLE_CHANNELS } from '@shared/ipc/lifecycle'
import {
  isAliasUpdatePage,
  isAliasUpdateResult,
} from '@shared/ipc/aliasUpdates'
import {
  CLASSIFICATION_CHANNELS,
  isClassificationPreparationPage,
  isClassificationApplyResult,
} from '@shared/ipc/classification'
import {
  CATEGORY_CHANNELS,
  isCategory,
  isCategoryPage,
} from '@shared/ipc/categories'

// Custom APIs for renderer
const api: Api = {
  genres: {
    list: async (request = {}) =>
      requireIpcResult(
        await ipcRenderer.invoke(GENRE_CHANNELS.list, request),
        isGenrePage,
      ),
    readSample: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(GENRE_CHANNELS.readSample, request),
        isSampleGenresSnapshot,
      ),
    saveSample: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(GENRE_CHANNELS.saveSample, request),
        isSampleGenresSnapshot,
      ),
  },
  lifecycle: {
    onCloseRequested: (listener) => {
      const handler = (): void => listener()
      ipcRenderer.on(LIFECYCLE_CHANNELS.closeRequested, handler)
      return () =>
        ipcRenderer.removeListener(LIFECYCLE_CHANNELS.closeRequested, handler)
    },
  },
  classification: {
    readSampleType: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(
          CLASSIFICATION_CHANNELS.readSampleType,
          request,
        ),
        isSampleTypeSnapshot,
      ),
    saveSampleType: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(
          CLASSIFICATION_CHANNELS.saveSampleType,
          request,
        ),
        isSampleTypeSnapshot,
      ),
    applySample: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(CLASSIFICATION_CHANNELS.applySample, request),
        isClassificationApplyResult,
      ),
    listAliasUpdates: async (request = {}) =>
      requireIpcResult(
        await ipcRenderer.invoke(
          CLASSIFICATION_CHANNELS.listAliasUpdates,
          request,
        ),
        isAliasUpdatePage,
      ),
    incorporateAlias: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(
          CLASSIFICATION_CHANNELS.incorporateAlias,
          request,
        ),
        isAliasUpdateResult,
      ),
    prepareSample: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(
          CLASSIFICATION_CHANNELS.prepareSample,
          request,
        ),
        isClassificationPreparationPage,
      ),
  },
  categories: {
    readSample: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(CATEGORY_CHANNELS.readSample, request),
        isSampleCategoriesSnapshot,
      ),
    saveSample: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(CATEGORY_CHANNELS.saveSample, request),
        isSampleCategoriesSnapshot,
      ),
    list: async (request = {}) =>
      requireIpcResult(
        await ipcRenderer.invoke(CATEGORY_CHANNELS.list, request),
        isCategoryPage,
      ),
    create: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(CATEGORY_CHANNELS.create, request),
        isCategory,
      ),
    rename: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(CATEGORY_CHANNELS.rename, request),
        isCategory,
      ),
  },
  dialog: {
    openFolder: async () =>
      requireIpcResult(
        await ipcRenderer.invoke(DIALOG_CHANNELS.openFolder),
        isFolderSelection,
      ),
  },
  library: {
    list: async (request = {}) =>
      requireIpcResult(
        await ipcRenderer.invoke(LIBRARY_CHANNELS.list, request),
        isLibraryPage,
      ),
    importFolder: async (directory) =>
      requireIpcResult(
        await ipcRenderer.invoke(LIBRARY_CHANNELS.importFolder, { directory }),
        isAudioSamples,
      ),
    setFavorite: async (id, favorite) =>
      requireIpcResult(
        await ipcRenderer.invoke(LIBRARY_CHANNELS.setFavorite, {
          id,
          favorite,
        }),
        isFavoriteState,
      ),
    startDrag: (audioUrl) =>
      ipcRenderer.send(LIBRARY_CHANNELS.startDrag, audioUrl),
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
    },
  },
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
