export const IPC = {
  dialog: { openFolder: 'dialog:openFolder' },
  library: { readDir: 'library:readDir' }
} as const

export type AudioFile = { name: string; path: string; relativePath: string }

export interface Api {
  dialog: {
    openFolder: () => Promise<string | null>
  }
  library: {
    readDir: (dir: string) => Promise<AudioFile[]>
  }
}
