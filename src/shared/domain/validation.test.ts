import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { isEntityId, requireName } from './validation.ts'

test('domain validation rejects empty names and malformed identities', () => {
  for (const value of ['', '\t\n', null, 7]) {
    assert.throws(() => requireName(value), { code: 'INVALID_INPUT' })
  }
  assert.equal(isEntityId(randomUUID()), true)
  assert.equal(isEntityId('not-an-id'), false)
})
