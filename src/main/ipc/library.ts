import { ipcMain, nativeImage } from 'electron'
import { accessSync, constants, realpathSync, statSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { IPC, type AudioDragError } from '../../shared/ipc'
import { readAudioDir } from '../services/library'
import { getAudioSource, registerAudioSources } from '../services/audio'
import icon from '../../../resources/icon.png?asset'

export function registerLibraryIpc(): void {
  const dragIcon = nativeImage.createFromPath(icon).resize({ width: 64, height: 64 })
  ipcMain.handle(IPC.library.readDir, async (_e, dir: string) => {
    const files = await readAudioDir(await realpath(dir))
    return registerAudioSources(files)
  })
  ipcMain.on(IPC.library.startDrag, (event, audioUrl: unknown) => {
    try {
      if (typeof audioUrl !== 'string') throw new Error('Identificador de sample invalido')
      const file = getAudioSource(audioUrl)
      if (!file) throw new Error('El sample ya no pertenece a la biblioteca cargada')
      // Native dragging must begin within the original gesture, without awaiting filesystem work.
      if (realpathSync(file) !== file || !statSync(file).isFile()) {
        throw new Error('El sample ya no es un archivo de audio disponible')
      }
      accessSync(file, constants.R_OK)
      if (dragIcon.isEmpty()) throw new Error('No se pudo cargar el icono de arrastre')
      event.sender.startDrag({ file, icon: dragIcon })
    } catch (error) {
      console.error('No se pudo iniciar el arrastre del sample:', error)
      const detail = error instanceof Error ? error.message : 'Error desconocido'
      const failure: AudioDragError = {
        audioUrl: typeof audioUrl === 'string' ? audioUrl : '',
        message: `No se pudo arrastrar el sample: ${detail}`
      }
      if (!event.sender.isDestroyed()) event.sender.send(IPC.library.dragError, failure)
    }
  })
}
