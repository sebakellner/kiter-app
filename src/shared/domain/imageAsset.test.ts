import assert from 'node:assert/strict'
import { test } from 'node:test'
import { IMAGE_MAX_BYTES, isImageAsset } from './imageAsset.ts'
import { makeImageAsset } from '../../../tests/support/fixtures/image.ts'

test('Image contracts reject unsafe keys, invalid dimensions and states', () => {
  const asset = makeImageAsset()
  assert.ok(isImageAsset(asset))
  for (const invalid of [
    { storageKey: '../original.png' },
    { byteSize: IMAGE_MAX_BYTES + 1 },
    { width: 4097 },
    { height: 0 },
    { state: 'deleting' },
    { mimeType: 'image/svg+xml' },
  ]) {
    assert.equal(isImageAsset({ ...asset, ...invalid }), false)
  }
  assert.ok(
    isImageAsset({
      ...asset,
      width: 4096,
      height: 4096,
      byteSize: IMAGE_MAX_BYTES,
    }),
  )
})
