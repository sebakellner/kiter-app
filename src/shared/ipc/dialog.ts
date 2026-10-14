import type { IpcResult } from './result.ts'

export const DIALOG_CHANNELS = { openFolder: 'dialog:open-folder' } as const
export interface DialogApi {
  openFolder: () => Promise<IpcResult<string | null>>
}

export function isFolderSelection(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.length > 0)
}
