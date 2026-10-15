import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { isDbReply, isDbRequest } from './messages.ts'
import { makeImageAsset } from '../../../../tests/support/fixtures/image.ts'
import { isProfileUpdate } from '../../../shared/domain/profile.ts'

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

test('Image worker contracts reject malformed targets and unsafe asset payloads', () => {
  const asset = makeImageAsset()
  assert.equal(isProfileUpdate({ name: 'Valid' }), false)
  assert.equal(
    isDbRequest({
      action: 'publish-image',
      requestId: 1,
      input: { target: { kind: 'profile' }, expectedAssetId: null, asset },
    }),
    true,
  )
  assert.equal(
    isDbRequest({
      action: 'publish-image',
      requestId: 1,
      input: {
        target: { kind: 'sample', id: randomUUID() },
        expectedAssetId: null,
        asset,
      },
    }),
    false,
  )
  assert.equal(
    isDbReply({
      action: 'list-images',
      requestId: 1,
      result: [{ ...asset, storageKey: '/etc/image' }],
    }),
    false,
  )
})
