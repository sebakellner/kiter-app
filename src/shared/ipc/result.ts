import { isRecord } from '../domain/validation.ts'

export const APP_ERROR_CODES = [
  'INVALID_INPUT',
  'UNAUTHORIZED',
  'NOT_FOUND',
  'UNSUPPORTED_FORMAT',
  'UNSUPPORTED_VERSION',
  'INTEGRITY_FAILED',
  'STORAGE_FAILED',
  'WORKER_FAILED',
  'PROTOCOL_ERROR',
  'CLOSING',
  'FOLDER_FAILED',
  'DIALOG_FAILED'
] as const

export type AppErrorCode = (typeof APP_ERROR_CODES)[number]
export interface AppFailure {
  code: AppErrorCode
  message: string
}
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: AppFailure }

export class IpcError extends Error {
  readonly code: AppErrorCode

  constructor(code: AppErrorCode, message: string) {
    super(message)
    this.name = 'IpcError'
    this.code = code
  }
}

export function requireIpcResult<T>(
  value: unknown,
  isData: (data: unknown) => data is T
): IpcResult<T> {
  if (isRecord(value)) {
    if (value.ok === true && isData(value.data)) return { ok: true, data: value.data }
    const failure = value.error
    if (
      value.ok === false &&
      isRecord(failure) &&
      typeof failure.message === 'string' &&
      failure.message.length > 0
    ) {
      const code = APP_ERROR_CODES.find((code) => code === failure.code)
      if (code) return { ok: false, error: { code, message: failure.message } }
    }
  }
  throw new IpcError('PROTOCOL_ERROR', 'Invalid application response. Restart Kiter to retry.')
}

export function unwrapIpcResult<T>(result: IpcResult<T>): T {
  if (!result.ok) throw new IpcError(result.error.code, result.error.message)
  return result.data
}
