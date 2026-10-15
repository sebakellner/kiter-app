import assert from 'node:assert/strict'
import { test } from 'node:test'
import { invokeResult } from './result.ts'
import { DbError } from '../db/errors.ts'
import { DomainValidationError } from '../../shared/domain/validation.ts'
import { IpcError } from '../../shared/ipc/result.ts'

test('IPC boundary maps controlled failures and redacts unexpected native details', async () => {
  const fallback = {
    code: 'FOLDER_FAILED',
    message: 'Unable to load the folder',
  } as const
  assert.deepEqual(await invokeResult('test', fallback, () => []), {
    ok: true,
    data: [],
  })
  for (const error of [
    new IpcError('UNAUTHORIZED', 'Unauthorized IPC request'),
    new DomainValidationError('Invalid input'),
    new DbError('DB_INTEGRITY', 'Invalid database'),
  ]) {
    const result = await invokeResult('test', fallback, () => {
      throw error
    })
    assert.deepEqual(result, {
      ok: false,
      error: {
        code: error.code === 'DB_INTEGRITY' ? 'INTEGRITY_FAILED' : error.code,
        message: error.message,
      },
    })
  }
  const failure = await invokeResult('test', fallback, () => {
    throw new Error('SQLITE_CANTOPEN /Users/private/library.sqlite')
  })
  assert.deepEqual(failure, { ok: false, error: fallback })
})
