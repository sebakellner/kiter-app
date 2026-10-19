import { registerDialogIpc } from './dialog'
import { registerLibraryIpc } from './library'
import { registerInstrumentsIpc } from './instruments'
import { registerClassificationIpc } from './classification'
import { registerGenresIpc } from './genres'
import { registerCollectionsIpc } from './collections'
import type { DbClient } from '../db'

export function registerIpc(database: DbClient): void {
  registerDialogIpc()
  registerLibraryIpc(database)
  registerInstrumentsIpc(database)
  registerClassificationIpc(database)
  registerGenresIpc(database)
  registerCollectionsIpc(database)
}
