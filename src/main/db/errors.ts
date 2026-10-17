export type DbErrorCode =
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_FORMAT'
  | 'UNSUPPORTED_VERSION'
  | 'DB_INTEGRITY'
  | 'BACKUP_FAILED'
  | 'NOT_FOUND'
  | 'NAME_CONFLICT'
  | 'STALE_REVIEW'
  | 'STORAGE_FAILED'
  | 'WORKER_FAILED'
  | 'PROTOCOL_ERROR'
  | 'CLOSING'

export interface DbFailure {
  code: DbErrorCode
  message: string
}

export class DbError extends Error {
  readonly code: DbErrorCode

  constructor(code: DbErrorCode, message: string) {
    super(message)
    this.name = 'DbError'
    this.code = code
  }
}

export function dbFailure(error: unknown): DbFailure {
  if (error instanceof DbError) {
    return { code: error.code, message: error.message }
  }
  if (
    error instanceof Error &&
    'code' in error &&
    error.code === 'INVALID_INPUT'
  ) {
    return { code: 'INVALID_INPUT', message: error.message }
  }
  return {
    code: 'STORAGE_FAILED',
    message:
      'Unable to access the local library. Check storage access and available disk space.',
  }
}
