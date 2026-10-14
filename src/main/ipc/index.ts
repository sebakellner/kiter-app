import { registerDialogIpc } from './dialog'
import { registerLibraryIpc } from './library'
import type { DbClient } from '../db'

export function registerIpc(database: DbClient): void {
  registerDialogIpc()
  registerLibraryIpc(database)
}
