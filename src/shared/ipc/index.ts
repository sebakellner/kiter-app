import type { DialogApi } from './dialog.ts'
import type { LibraryApi } from './library.ts'

export interface Api {
  dialog: DialogApi
  library: LibraryApi
}
export { DIALOG_CHANNELS } from './dialog.ts'
export { LIBRARY_CHANNELS } from './library.ts'
export type { AudioFile } from '../domain/source.ts'
export type { LibrarySample, AudioSample, FavoriteState, AudioDragError } from './library.ts'
export type { IpcResult, AppFailure, AppErrorCode } from './result.ts'
