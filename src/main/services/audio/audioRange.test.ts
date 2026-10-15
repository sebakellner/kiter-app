import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseByteRange } from './audioRange.ts'

test('parses bounded, open-ended and suffix byte ranges', () => {
  assert.deepEqual(parseByteRange('bytes=0-43', 100), { start: 0, end: 43 })
  assert.deepEqual(parseByteRange('bytes=20-', 100), { start: 20, end: 99 })
  assert.deepEqual(parseByteRange('bytes=-10', 100), { start: 90, end: 99 })
  assert.deepEqual(parseByteRange('bytes=-200', 100), { start: 0, end: 99 })
  assert.deepEqual(parseByteRange('bytes=80-200', 100), { start: 80, end: 99 })
})

test('rejects invalid, unsupported and unsatisfiable ranges', () => {
  for (const header of [
    'bytes=',
    'bytes=-',
    'bytes=-0',
    'bytes=100-',
    'bytes=20-10',
    'bytes=0-10,20-30',
    'items=0-10',
    'bytes=999999999999999999999999-',
  ]) {
    assert.equal(parseByteRange(header, 100), null, header)
  }
  assert.equal(parseByteRange('bytes=0-0', 0), null)
})
