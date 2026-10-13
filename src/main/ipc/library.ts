import { BrowserWindow, ipcMain, nativeImage } from 'electron'
import { accessSync, constants, realpathSync, statSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { IPC, type AudioDragError, type AudioFile } from '../../shared/ipc'
import { readAudioDir } from '../services/library'
import { getAudioSource, registerAudioSources } from '../services/audio'
import icon from '../../../resources/icon.png?asset'
import type { Catalog } from '../services/catalog'

export function registerLibraryIpc(catalog: Catalog): void {
  const dragIcon = nativeImage.createFromPath(icon).resize({ width: 64, height: 64 })
  let activeIds = new Set<string>()
  ipcMain.handle(IPC.library.readDir, async (event, dir: unknown) => {
    if (
      !BrowserWindow.fromWebContents(event.sender) ||
      event.senderFrame !== event.sender.mainFrame
    ) {
      throw new Error('Unauthorized library request')
    }
    if (typeof dir !== 'string' || !dir) throw new Error('Invalid folder')
    let root: string
    const canonicalFiles: AudioFile[] = []
    try {
      root = await realpath(dir)
      const files = await readAudioDir(root)
      for (const file of files) {
        canonicalFiles.push({ ...file, path: await realpath(file.path) })
      }
    } catch (error) {
      const code =
        error instanceof Error && 'code' in error && typeof error.code === 'string'
          ? error.code
          : 'CATALOG_READ_FAILED'
      console.error('Library import failed:', code)
      throw new Error(
        `Unable to load the folder (${code}). Check folder access and catalog storage.`
      )
    }
    const samples = await catalog.importFolder(root, canonicalFiles)
    activeIds = new Set(samples.map((sample) => sample.id))
    return registerAudioSources(samples)
  })
  ipcMain.handle(IPC.library.setFavorite, async (event, id: unknown, favorite: unknown) => {
    if (
      !BrowserWindow.fromWebContents(event.sender) ||
      event.senderFrame !== event.sender.mainFrame
    ) {
      throw new Error('Unauthorized favorite request')
    }
    if (typeof id !== 'string' || typeof favorite !== 'boolean' || !activeIds.has(id)) {
      throw new Error('Invalid or inactive sample')
    }
    return catalog.setFavorite(id, favorite)
  })
  ipcMain.on(IPC.library.startDrag, (event, audioUrl: unknown) => {
    try {
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
  })
}
