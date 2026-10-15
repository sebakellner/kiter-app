import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requireIpcResult, unwrapIpcResult } from './result.ts'
import { isFolderSelection } from './dialog.ts'
import { isAudioSamples, isFavoriteState } from './library.ts'

test('IPC envelopes distinguish cancellation, empty success and typed failure after serialization', () => {
  assert.equal(
    unwrapIpcResult(
      requireIpcResult({ ok: true, data: null }, isFolderSelection),
    ),
    null,
  )
  assert.deepEqual(
    unwrapIpcResult(requireIpcResult({ ok: true, data: [] }, isAudioSamples)),
    [],
  )
  const failure = JSON.parse(
    JSON.stringify({
      ok: false,
      error: { code: 'STORAGE_FAILED', message: 'Unable to save favorite' },
    }),
  )
  assert.throws(
    () => unwrapIpcResult(requireIpcResult(failure, isFavoriteState)),
    {
      code: 'STORAGE_FAILED',
      message: 'Unable to save favorite',
    },
  )
})

test('IPC result validation rejects malformed responses and success-shaped fallbacks', () => {
  for (const value of [
    null,
    [],
    { ok: true },
    { ok: true, data: 'invalid' },
    { ok: false, error: { code: 'UNKNOWN', message: 'Failure' } },
    { ok: false, error: { code: 'STORAGE_FAILED', message: '' } },
  ]) {
    assert.throws(() => requireIpcResult(value, isFavoriteState), {
      code: 'PROTOCOL_ERROR',
    })
  }
})
