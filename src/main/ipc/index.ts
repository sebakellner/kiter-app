import { registerDialogIpc } from './dialog'
import { registerLibraryIpc } from './library'
import type { Catalog } from '../services/catalog'

export function registerIpc(catalog: Catalog): void {
  registerDialogIpc()
  registerLibraryIpc(catalog)
}
