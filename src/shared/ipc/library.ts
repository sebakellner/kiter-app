import type { AudioFile } from '../domain/source.ts'
import { isEntityId, isRecord } from '../domain/validation.ts'
import type { IpcResult } from './result.ts'

export const LIBRARY_CHANNELS = {
  importFolder: 'library:import-folder',
  setFavorite: 'library:set-favorite',
  startDrag: 'library:start-drag',
  dragError: 'library:drag-error'
} as const

export type LibrarySample = AudioFile & { id: string; favorite: boolean }
export type AudioSample = LibrarySample & { audioUrl: string }
export type FavoriteState = { id: string; favorite: boolean }
export type AudioDragError = { audioUrl: string; message: string }
export interface ImportFolderRequest {
  directory: string
}
export interface SetFavoriteRequest {
  id: string
  favorite: boolean
}

export interface LibraryApi {
  importFolder: (directory: string) => Promise<IpcResult<AudioSample[]>>
  setFavorite: (id: string, favorite: boolean) => Promise<IpcResult<FavoriteState>>
  startDrag: (audioUrl: string) => void
  onDragError: (listener: (error: AudioDragError) => void) => () => void
}

export function isImportFolderRequest(value: unknown): value is ImportFolderRequest {
  return isRecord(value) && typeof value.directory === 'string' && value.directory.length > 0
}

export function isSetFavoriteRequest(value: unknown): value is SetFavoriteRequest {
  return isRecord(value) && isEntityId(value.id) && typeof value.favorite === 'boolean'
}

export function isFavoriteState(value: unknown): value is FavoriteState {
  return isRecord(value) && isEntityId(value.id) && typeof value.favorite === 'boolean'
}

export function isAudioSamples(value: unknown): value is AudioSample[] {
  return (
    Array.isArray(value) &&
    value.every(
      (sample) =>
        isRecord(sample) &&
        typeof sample.name === 'string' &&
        typeof sample.path === 'string' &&
        typeof sample.relativePath === 'string' &&
        typeof sample.audioUrl === 'string' &&
        /^sample:\/\/audio\/[0-9a-f-]+$/.test(sample.audioUrl) &&
        isFavoriteState(sample)
    )
  )
}

export function isAudioDragError(value: unknown): value is AudioDragError {
  return isRecord(value) && typeof value.audioUrl === 'string' && typeof value.message === 'string'
}
