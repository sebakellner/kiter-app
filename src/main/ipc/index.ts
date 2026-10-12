import { registerDialogIpc } from './dialog'
import { registerLibraryIpc } from './library'

export function registerIpc(): void {
  registerDialogIpc()
  registerLibraryIpc()
}
