export const IPC = {
  dialog: { openFolder: 'dialog:openFolder' },
  library: {
    readDir: 'library:readDir',
    setFavorite: 'library:setFavorite',
    startDrag: 'library:startDrag',
    dragError: 'library:dragError'
  }
} as const

export type AudioFile = { name: string; path: string; relativePath: string }
export type CatalogSample = AudioFile & { id: string; favorite: boolean }
export type AudioSample = CatalogSample & { audioUrl: string }
export type FavoriteState = { id: string; favorite: boolean }
export type AudioDragError = { audioUrl: string; message: string }

export interface Api {
  dialog: {
    openFolder: () => Promise<string | null>
  }
  library: {
    readDir: (dir: string) => Promise<AudioSample[]>
    setFavorite: (id: string, favorite: boolean) => Promise<FavoriteState>
    startDrag: (audioUrl: string) => void
    onDragError: (listener: (error: AudioDragError) => void) => () => void
  }
}
