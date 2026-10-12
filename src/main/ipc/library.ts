import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import { readAudioDir } from '../services/library'

export function registerLibraryIpc(): void {
  ipcMain.handle(IPC.library.readDir, (_e, dir: string) => readAudioDir(dir))
}
