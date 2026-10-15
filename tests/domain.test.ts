import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { normalizeName } from '../src/shared/domain/classification.ts'
import { isEntityId, requireName } from '../src/shared/domain/validation.ts'
import { isDbReply, isDbRequest } from '../src/main/db/protocol.ts'

test('classification keys ignore external whitespace/case but preserve accents and internal spaces', () => {
  assert.equal(normalizeName('  DRUMS  '), 'drums')
  assert.equal(
    normalizeName('Électronique'),
    normalizeName(' E\u0301LECTRONIQUE '),
  )
  assert.notEqual(normalizeName('Électronique'), normalizeName('Electronique'))
  assert.notEqual(normalizeName('Hi Hat'), normalizeName('Hi  Hat'))
  for (const value of ['', '\t\n', null, 7]) {
    assert.throws(() => requireName(value), { code: 'INVALID_INPUT' })
  }
  assert.equal(isEntityId(randomUUID()), true)
  assert.equal(isEntityId('not-an-id'), false)
})

test('worker protocol rejects malformed messages and validates zero volume and identity correlation', () => {
  const id = randomUUID()
  assert.equal(isDbRequest({ requestId: 1, action: 'volume', volume: 0 }), true)
  for (const value of [
    null,
    { requestId: 1, action: 'unknown' },
    { requestId: 1, action: 'volume', volume: NaN },
    { requestId: 1, action: 'favorite', id, favorite: 'true' },
    { requestId: -1, action: 'profile' },
  ]) {
    assert.equal(isDbRequest(value), false)
  }
  assert.equal(
    isDbReply({
      requestId: 1,
      action: 'volume',
      result: { profileId: id, previewVolume: 0 },
    }),
    true,
  )
  assert.equal(
    isDbReply({
      requestId: 1,
      action: 'profile',
      result: {
        profile: {
          id,
          name: 'Local profile',
          avatarAssetId: null,
          authorId: null,
        },
        preferences: { profileId: randomUUID(), previewVolume: 1 },
      },
    }),
    false,
  )
  assert.equal(
    isDbReply({
      requestId: 1,
      action: 'error',
      failure: { code: 'unknown', message: 'Failure' },
    }),
    false,
  )
})
