import { ipcMain, nativeImage } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import { accessSync, constants, realpathSync, statSync } from 'node:fs'
import {
  LIBRARY_CHANNELS,
  type AudioDragError,
  type AudioSample,
  type FavoriteState,
} from '../../shared/ipc'
import {
  isImportFolderRequest,
  isSetFavoriteRequest,
} from '../../shared/ipc/library'
import { IpcError } from '../../shared/ipc/result'
import { importLibraryFolder } from '../services/library'
import { getAudioSource, registerAudioSources } from '../services/audio'
import icon from '../../../resources/icon.png?asset'
import type { DbClient } from '../db'
import { requireMainFrameWindow } from './authorize'
import { invokeResult } from './result'

const DRAG_ICON_SIZE = 64

export function registerLibraryIpc(database: DbClient): void {
  const dragIcon = nativeImage
    .createFromPath(icon)
    .resize({ width: DRAG_ICON_SIZE, height: DRAG_ICON_SIZE })
  let activeIds = new Set<string>()

  async function handleImportFolder(
    event: IpcMainInvokeEvent,
    request: unknown,
  ): Promise<AudioSample[]> {
    requireMainFrameWindow(event)
    if (!isImportFolderRequest(request)) {
      throw new IpcError('INVALID_INPUT', 'Invalid folder')
    }
    const samples = await importLibraryFolder(request.directory, database)
    activeIds = new Set(samples.map((sample) => sample.id))
    return registerAudioSources(samples)
  }

  async function handleSetFavorite(
    event: IpcMainInvokeEvent,
    request: unknown,
  ): Promise<FavoriteState> {
    requireMainFrameWindow(event)
    if (!isSetFavoriteRequest(request) || !activeIds.has(request.id)) {
      throw new IpcError('INVALID_INPUT', 'Invalid or inactive sample')
    }
    return database.setFavorite(request.id, request.favorite)
  }

  function handleStartDrag(event: IpcMainEvent, audioUrl: unknown): void {
    try {
      requireMainFrameWindow(event)
      if (typeof audioUrl !== 'string') {
        throw new Error('Invalid sample identifier')
      }
      const file = getAudioSource(audioUrl)
      if (!file) {
        throw new Error('The sample is no longer in the loaded library')
      }
      // Native dragging must begin within the original gesture, without awaiting filesystem work.
      if (realpathSync(file) !== file || !statSync(file).isFile()) {
        throw new Error('The sample file is no longer available')
      }
      accessSync(file, constants.R_OK)
      if (dragIcon.isEmpty()) {
        throw new Error('Unable to load the drag icon')
      }
      event.sender.startDrag({ file, icon: dragIcon })
    } catch (error) {
      const code =
        error instanceof Error &&
        'code' in error &&
        typeof error.code === 'string'
          ? error.code
          : 'DRAG_FAILED'
      console.error('Sample drag failed:', code)
      const detail =
        code !== 'DRAG_FAILED'
          ? code
          : error instanceof Error
            ? error.message
            : 'Unknown error'
      const failure: AudioDragError = {
        audioUrl: typeof audioUrl === 'string' ? audioUrl : '',
        message: `Unable to drag the sample: ${detail}`,
      }
      if (!event.sender.isDestroyed()) {
        event.sender.send(LIBRARY_CHANNELS.dragError, failure)
      }
    }
  }

  ipcMain.handle(LIBRARY_CHANNELS.importFolder, (event, request: unknown) =>
    invokeResult(
      'library.importFolder',
      {
        code: 'FOLDER_FAILED',
        message:
          'Unable to load the folder. Check folder access and database storage.',
      },
      () => handleImportFolder(event, request),
    ),
  )
  ipcMain.handle(LIBRARY_CHANNELS.setFavorite, (event, request: unknown) =>
    invokeResult(
      'library.setFavorite',
      {
        code: 'STORAGE_FAILED',
        message: 'Unable to save favorite. Check database storage.',
      },
      () => handleSetFavorite(event, request),
    ),
  )
  ipcMain.on(LIBRARY_CHANNELS.startDrag, handleStartDrag)
}
