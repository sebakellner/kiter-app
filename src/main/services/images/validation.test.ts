import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { validateImage } from './validation.ts'
import { IMAGE_MAX_BYTES } from '../../../shared/domain/imageAsset.ts'
import { createPng } from '../../../../tests/support/fixtures/png.ts'

test('Image validation decodes real content, accepts boundaries and rejects corruption, animation and unsupported content', async () => {
  for (const format of ['png', 'jpeg', 'webp'] as const) {
    const bytes = await sharp({
      create: { width: 4096, height: 1, channels: 3, background: 'red' },
    })
      [format]()
      .toBuffer()
    assert.equal((await validateImage(bytes)).width, 4096)
  }
  const valid = await createPng()
  const oversized = await sharp({
    create: { width: 4097, height: 1, channels: 3, background: 'red' },
  })
    .png()
    .toBuffer()
  const gif = await sharp(valid).gif().toBuffer()
  // Insert an APNG animation-control chunk before image data.
  const animated = Buffer.concat([
    valid.subarray(0, 33),
    Buffer.from([0, 0, 0, 8]),
    Buffer.from('acTL'),
    Buffer.alloc(12),
    valid.subarray(33),
  ])
  for (const bytes of [
    Buffer.alloc(0),
    Buffer.alloc(IMAGE_MAX_BYTES + 1),
    Buffer.from('<svg/>'),
    valid.subarray(0, 40),
    oversized,
    gif,
    animated,
  ]) {
    await assert.rejects(validateImage(bytes), { code: 'INVALID_INPUT' })
  }
})
