import { DbError } from '../db/errors.ts'
import { DomainValidationError } from '../../shared/domain/validation.ts'
import { IpcError } from '../../shared/ipc/result.ts'
import type { AppFailure, IpcResult } from '../../shared/ipc/result.ts'

export async function invokeResult<T>(
  operation: string,
  fallback: AppFailure,
  work: () => T | Promise<T>,
): Promise<IpcResult<T>> {
  try {
    return { ok: true, data: await work() }
  } catch (error) {
    let failure = fallback
    if (error instanceof IpcError || error instanceof DomainValidationError) {
      failure = { code: error.code, message: error.message }
    } else if (error instanceof DbError) {
      failure = {
        code: error.code === 'DB_INTEGRITY' ? 'INTEGRITY_FAILED' : error.code,
        message: error.message,
      }
    }
    console.error('IPC operation failed:', operation, failure.code)
    return { ok: false, error: failure }
  }
}
