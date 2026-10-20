import { APP_ERROR_CODES, IpcError } from '../../../shared/ipc/result.ts'

const DIAGNOSTIC_CODES = new Set<string>([
  ...APP_ERROR_CODES,
  'ENOENT',
  'EACCES',
  'EPERM',
  'ENOSPC',
  'EIO',
  'EROFS',
  'EMFILE',
  'ENFILE',
  'ENOTDIR',
  'EEXIST',
])

export type PreparationWorkStage =
  | 'set-mode'
  | 'set-selection'
  | 'set-subtree-selection'
  | 'set-destinations'
  | 'set-origin-decisions'
  | 'set-pack-details'
  | 'remove-root'
  | 'rescan-root'
  | 'review'

export function logPreparationFailure(
  stage: 'prepare' | 'build' | 'read-page' | 'cleanup' | PreparationWorkStage,
  error: unknown,
): void {
  const code =
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    DIAGNOSTIC_CODES.has(error.code)
      ? error.code
      : 'UNEXPECTED_ERROR'
  console.error('Import preparation failed:', stage, code)
}

export function preparationFailure(message: string, cause: unknown): IpcError {
  const failure = new IpcError('STORAGE_FAILED', message)
  // Preserve local evidence without adding raw errors to enumerable IPC data.
  Object.defineProperty(failure, 'cause', {
    value: cause,
    configurable: true,
    writable: true,
  })
  return failure
}
