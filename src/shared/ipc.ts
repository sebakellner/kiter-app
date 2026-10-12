export const IPC = {
  dialog: { openFolder: 'dialog:openFolder' },
  library: {
    readDir: 'library:readDir',
    startDrag: 'library:startDrag',
    dragError: 'library:dragError'
  }
} as const

export type AudioFile = { name: string; path: string; relativePath: string }
export type AudioSample = AudioFile & { audioUrl: string }
export type AudioDragError = { audioUrl: string; message: string }

export interface Api {
  dialog: {
    openFolder: () => Promise<string | null>
  }
  library: {
    readDir: (dir: string) => Promise<AudioSample[]>
    startDrag: (audioUrl: string) => void
    onDragError: (listener: (error: AudioDragError) => void) => () => void
  }
}
