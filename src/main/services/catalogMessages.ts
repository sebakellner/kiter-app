import type { AudioFile, CatalogSample, FavoriteState } from '../../shared/ipc'

export type CatalogRequest =
  | { requestId: number; action: 'import'; root: string; files: AudioFile[] }
  | { requestId: number; action: 'favorite'; id: string; favorite: boolean }
  | { requestId: number; action: 'close' }

export type CatalogReply =
  | { requestId: number; action: 'import'; result: CatalogSample[] }
  | { requestId: number; action: 'favorite'; result: FavoriteState }
  | { requestId: number; action: 'close' }
  | { requestId: number; action: 'error'; message: string }
