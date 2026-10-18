import { registerDialogIpc } from './dialog'
import { registerLibraryIpc } from './library'
import { registerCategoriesIpc } from './categories'
import { registerClassificationIpc } from './classification'
import type { DbClient } from '../db'

export function registerIpc(database: DbClient): void {
  registerDialogIpc()
  registerLibraryIpc(database)
  registerCategoriesIpc(database)
  registerClassificationIpc(database)
}
