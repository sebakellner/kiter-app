import type { ClientRequest } from './core.ts'
import type { WorkerTransport } from './worker-transport.ts'
import type { LibrarySample, FavoriteState } from '../../../shared/ipc/index.ts'
import type { DiscoveredAudioFile } from '../../../shared/domain/source.ts'
import { requireEntityId } from '../../../shared/domain/validation.ts'

export interface LibraryCommands {
  importFolder(
    root: string,
    files: DiscoveredAudioFile[],
  ): Promise<LibrarySample[]>
  setFavorite(id: string, favorite: boolean): Promise<FavoriteState>
}

export function libraryCommands(
  request: ClientRequest,
  transport: WorkerTransport,
): LibraryCommands {
  return {
    async importFolder(
      root: string,
      files: DiscoveredAudioFile[],
    ): Promise<LibrarySample[]> {
      return request({ action: 'import', root, files })
    },

    async setFavorite(id: string, favorite: boolean): Promise<FavoriteState> {
      transport.assertOpen()
      requireEntityId(id)
      return request({ action: 'favorite', id, favorite })
    },
  }
}
