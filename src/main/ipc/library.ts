import { ipcMain, nativeImage } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import { accessSync, constants, realpathSync, statSync } from 'node:fs'
import { IPC, type AudioDragError, type AudioSample, type FavoriteState } from '../../shared/ipc'
import { importLibraryFolder } from '../services/library'
import { getAudioSource, registerAudioSources } from '../services/audio'
import icon from '../../../resources/icon.png?asset'
import type { Catalog } from '../services/catalog'
import { requireMainFrameWindow } from './authorize'

const DRAG_ICON_SIZE = 64

export function registerLibraryIpc(catalog: Catalog): void {
  const dragIcon = nativeImage
    .createFromPath(icon)
    .resize({ width: DRAG_ICON_SIZE, height: DRAG_ICON_SIZE })
  let activeIds = new Set<string>()

  async function handleReadDir(event: IpcMainInvokeEvent, dir: unknown): Promise<AudioSample[]> {
    requireMainFrameWindow(event)
    if (typeof dir !== 'string' || !dir) throw new Error('Invalid folder')
    const samples = await importLibraryFolder(dir, catalog)
    activeIds = new Set(samples.map((sample) => sample.id))
    return registerAudioSources(samples)
  }

  async function handleSetFavorite(
    event: IpcMainInvokeEvent,
    id: unknown,
    favorite: unknown
  ): Promise<FavoriteState> {
    requireMainFrameWindow(event)
    if (typeof id !== 'string' || typeof favorite !== 'boolean' || !activeIds.has(id)) {
      throw new Error('Invalid or inactive sample')
    }
    return catalog.setFavorite(id, favorite)
  }

  function handleStartDrag(event: IpcMainEvent, audioUrl: unknown): void {
    try {
      requireMainFrameWindow(event)
      if (typeof audioUrl !== 'string') throw new Error('Invalid sample identifier')
      const file = getAudioSource(audioUrl)
      if (!file) throw new Error('The sample is no longer in the loaded library')
      // Native dragging must begin within the original gesture, without awaiting filesystem work.
      if (realpathSync(file) !== file || !statSync(file).isFile()) {
        throw new Error('The sample file is no longer available')
      }
      accessSync(file, constants.R_OK)
      if (dragIcon.isEmpty()) throw new Error('Unable to load the drag icon')
      event.sender.startDrag({ file, icon: dragIcon })
    } catch (error) {
      const code =
        error instanceof Error && 'code' in error && typeof error.code === 'string'
          ? error.code
          : 'DRAG_FAILED'
      console.error('Sample drag failed:', code)
      const detail =
        code !== 'DRAG_FAILED' ? code : error instanceof Error ? error.message : 'Unknown error'
      const failure: AudioDragError = {
        audioUrl: typeof audioUrl === 'string' ? audioUrl : '',
        message: `Unable to drag the sample: ${detail}`
      }
      if (!event.sender.isDestroyed()) event.sender.send(IPC.library.dragError, failure)
    }
  }

  ipcMain.handle(IPC.library.readDir, handleReadDir)
  ipcMain.handle(IPC.library.setFavorite, handleSetFavorite)
  ipcMain.on(IPC.library.startDrag, handleStartDrag)
}
