import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { requireIpcResult, unwrapIpcResult } from '../src/shared/ipc/result.ts'
import { isFolderSelection } from '../src/shared/ipc/dialog.ts'
import {
  isAudioSamples,
  isFavoriteState,
  isImportFolderRequest,
  isSetFavoriteRequest
} from '../src/shared/ipc/library.ts'
import { invokeResult } from '../src/main/ipc/result.ts'
import { DbError } from '../src/main/db/errors.ts'
import { DomainValidationError } from '../src/shared/domain/validation.ts'
import { IpcError } from '../src/shared/ipc/result.ts'

test('IPC envelopes distinguish cancellation, empty success and typed failure after serialization', () => {
  assert.equal(unwrapIpcResult(requireIpcResult({ ok: true, data: null }, isFolderSelection)), null)
  assert.deepEqual(unwrapIpcResult(requireIpcResult({ ok: true, data: [] }, isAudioSamples)), [])
  const failure = JSON.parse(
    JSON.stringify({
      ok: false,
      error: { code: 'STORAGE_FAILED', message: 'Unable to save favorite' }
    })
  )
  assert.throws(() => unwrapIpcResult(requireIpcResult(failure, isFavoriteState)), {
    code: 'STORAGE_FAILED',
    message: 'Unable to save favorite'
  })
})

test('IPC guards reject malformed requests, responses and success-shaped fallbacks', () => {
  const id = randomUUID()
  assert.ok(isImportFolderRequest({ directory: '/selected' }))
  assert.ok(isSetFavoriteRequest({ id, favorite: false }))
  for (const value of [null, '', { directory: '' }, { directory: 5 }]) {
    assert.equal(isImportFolderRequest(value), false)
  }
  for (const value of [null, { id, favorite: 'true' }, { id: 'invalid', favorite: true }]) {
    assert.equal(isSetFavoriteRequest(value), false)
  }
  for (const value of [
    null,
    [],
    { ok: true },
    { ok: true, data: 'invalid' },
    { ok: false, error: { code: 'UNKNOWN', message: 'Failure' } },
    { ok: false, error: { code: 'STORAGE_FAILED', message: '' } }
  ]) {
    assert.throws(() => requireIpcResult(value, isFavoriteState), { code: 'PROTOCOL_ERROR' })
  }
  assert.equal(
    isAudioSamples([
      {
        id,
        favorite: false,
        name: 'sample',
        path: '/sample.wav',
        relativePath: 'sample.wav',
        audioUrl: 'file:///sample.wav'
      }
    ]),
    false
  )
})

test('IPC boundary maps controlled failures and redacts unexpected native details', async () => {
  const fallback = { code: 'FOLDER_FAILED', message: 'Unable to load the folder' } as const
  assert.deepEqual(await invokeResult('test', fallback, () => []), { ok: true, data: [] })
  for (const error of [
    new IpcError('UNAUTHORIZED', 'Unauthorized IPC request'),
    new DomainValidationError('Invalid input'),
    new DbError('DB_INTEGRITY', 'Invalid database')
  ]) {
    const result = await invokeResult('test', fallback, () => {
      throw error
    })
    assert.deepEqual(result, {
      ok: false,
      error: {
        code: error.code === 'DB_INTEGRITY' ? 'INTEGRITY_FAILED' : error.code,
        message: error.message
      }
    })
  }
  const failure = await invokeResult('test', fallback, () => {
    throw new Error('SQLITE_CANTOPEN /Users/private/library.sqlite')
  })
  assert.deepEqual(failure, { ok: false, error: fallback })
})
