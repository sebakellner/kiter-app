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
import { isSampleInstrumentsSnapshot } from '@shared/ipc/sampleInstruments'
import { isSampleTypeSnapshot } from '@shared/ipc/sampleType'
import {
  GENRE_CHANNELS,
  isGenrePage,
  isSampleGenresSnapshot,
} from '@shared/ipc/genres'
import { LIFECYCLE_CHANNELS } from '@shared/ipc/lifecycle'
import {
  COLLECTION_CHANNELS,
  isCollection,
  isCollectionPage,
  isCollectionSummary,
  isCollectionDestinationPage,
  isCollectionMembershipResult,
  isCollectionMoveResult,
  isCollectionRemovalReview,
  isCollectionRemovalResult,
} from '@shared/ipc/collections'
import {
  isAliasUpdatePage,
  isAliasUpdateResult,
} from '@shared/ipc/aliasUpdates'
import {
  CLASSIFICATION_CHANNELS,
  isClassificationPreparationPage,
  isClassificationApplyResult,
} from '@shared/ipc/classification'
import { STANDALONE_REVIEW_CHANNELS } from '@shared/ipc/standaloneReview'
import {
  isStandaloneReviewAmbiguityPage,
  isStandaloneReviewDiscardResult,
  isStandaloneReviewExecutionResult,
  isStandaloneReviewPreparation,
  isStandaloneReviewProposalPage,
  isStandaloneReviewSummary,
} from '@shared/ipc/standaloneReviewResponses'
import {
  INSTRUMENT_CHANNELS,
  isInstrument,
  isInstrumentPage,
} from '@shared/ipc/instruments'
import { PACK_CHANNELS, isPackListPage } from '@shared/ipc/packs'

// Custom APIs for renderer
const api: Api = {
  packs: {
    list: async (request = {}) =>
      requireIpcResult(
        await ipcRenderer.invoke(PACK_CHANNELS.list, request),
        isPackListPage,
      ),
  },
  collections: {
    update: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(COLLECTION_CHANNELS.update, request),
        isCollection,
      ),
    reviewRemoval: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(COLLECTION_CHANNELS.reviewRemoval, request),
        isCollectionRemovalReview,
      ),
    remove: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(COLLECTION_CHANNELS.remove, request),
        isCollectionRemovalResult,
      ),
    placeSample: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(COLLECTION_CHANNELS.placeSample, request),
        isCollectionMoveResult,
      ),
    moveSample: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(COLLECTION_CHANNELS.moveSample, request),
        isCollectionMoveResult,
      ),
    destinations: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(COLLECTION_CHANNELS.destinations, request),
        isCollectionDestinationPage,
      ),
    setMembership: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(COLLECTION_CHANNELS.setMembership, request),
        isCollectionMembershipResult,
      ),
    create: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(COLLECTION_CHANNELS.create, request),
        isCollection,
      ),
    list: async (request = {}) =>
      requireIpcResult(
        await ipcRenderer.invoke(COLLECTION_CHANNELS.list, request),
        isCollectionPage,
      ),
    get: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(COLLECTION_CHANNELS.get, request),
        isCollectionSummary,
      ),
  },
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
  standaloneReview: {
    prepare: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(STANDALONE_REVIEW_CHANNELS.prepare, request),
        isStandaloneReviewPreparation,
      ),
    listProposals: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(
          STANDALONE_REVIEW_CHANNELS.listProposals,
          request,
        ),
        isStandaloneReviewProposalPage,
      ),
    listAmbiguities: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(
          STANDALONE_REVIEW_CHANNELS.listAmbiguities,
          request,
        ),
        isStandaloneReviewAmbiguityPage,
      ),
    stage: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(STANDALONE_REVIEW_CHANNELS.stage, request),
        isStandaloneReviewSummary,
      ),
    acceptAll: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(STANDALONE_REVIEW_CHANNELS.acceptAll, request),
        isStandaloneReviewSummary,
      ),
    discard: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(STANDALONE_REVIEW_CHANNELS.discard, request),
        isStandaloneReviewDiscardResult,
      ),
    execute: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(STANDALONE_REVIEW_CHANNELS.execute, request),
        isStandaloneReviewExecutionResult,
      ),
  },
  instruments: {
    readSample: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(INSTRUMENT_CHANNELS.readSample, request),
        isSampleInstrumentsSnapshot,
      ),
    saveSample: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(INSTRUMENT_CHANNELS.saveSample, request),
        isSampleInstrumentsSnapshot,
      ),
    list: async (request = {}) =>
      requireIpcResult(
        await ipcRenderer.invoke(INSTRUMENT_CHANNELS.list, request),
        isInstrumentPage,
      ),
    create: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(INSTRUMENT_CHANNELS.create, request),
        isInstrument,
      ),
    rename: async (request) =>
      requireIpcResult(
        await ipcRenderer.invoke(INSTRUMENT_CHANNELS.rename, request),
        isInstrument,
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
