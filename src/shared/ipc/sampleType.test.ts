import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  requireSampleTypeSaveRequest,
  isSampleTypeSnapshot,
} from './sampleType.ts'

test('Sample type schemas accept one fixed value and reject invented types, nulls and invalid identities', () => {
  const input = {
    sampleId: '00000000-0000-4000-8000-000000000001',
    token: 'a'.repeat(64),
    sampleType: 'unknown',
  }
  assert.deepEqual(requireSampleTypeSaveRequest(input), input)
  for (const value of ['invented', null, ['loop', 'one-shot'], undefined]) {
    assert.throws(() =>
      requireSampleTypeSaveRequest({ ...input, sampleType: value }),
    )
  }
  assert.throws(() =>
    requireSampleTypeSaveRequest({ ...input, sampleId: '/file.wav' }),
  )
  assert.throws(() => requireSampleTypeSaveRequest({ ...input, token: '' }))
  assert.equal(isSampleTypeSnapshot(input), true)
  assert.equal(isSampleTypeSnapshot({ ...input, sampleType: null }), false)
})
