import type { IpcResult } from './result.ts'

export const DIALOG_CHANNELS = {
  openFolder: 'dialog:open-folder',
  openFolders: 'dialog:open-folders',
} as const
export interface DialogApi {
  openFolder: () => Promise<IpcResult<string | null>>
  openFolders: () => Promise<IpcResult<string[]>>
}

export function isFolderSelection(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.length > 0)
}

// Cancelling the multi-folder picker is an empty list, not a failure. A
// repeated folder would register two Packs for one directory, so the reply must
// name each selected folder once.
export function isFolderSelectionList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === 'string' && entry.length > 0) &&
    new Set(value).size === value.length
  )
}
