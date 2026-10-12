import { ipcMain } from 'electron'
import { realpath } from 'node:fs/promises'
import { IPC } from '../../shared/ipc'
import { readAudioDir } from '../services/library'
import { registerAudioSources } from '../services/audio'

export function registerLibraryIpc(): void {
  ipcMain.handle(IPC.library.readDir, async (_e, dir: string) => {
    const files = await readAudioDir(await realpath(dir))
    return registerAudioSources(files)
  })
}
