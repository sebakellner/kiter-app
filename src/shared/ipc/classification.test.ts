import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  requireClassificationPreparationRequest,
  isClassificationPreparationPage,
} from './classification.ts'
import { randomUUID } from 'node:crypto'

test('preparation contracts require a Sample identity, bounded pages and a token beyond the first page', () => {
  const sampleId = randomUUID()
  assert.deepEqual(requireClassificationPreparationRequest({ sampleId }), {
    sampleId,
    limit: 50,
    offset: 0,
  })
  for (const input of [
    { sampleId: '/arbitrary/path' },
    { sampleId, limit: 101 },
    { sampleId, offset: 1 },
    { sampleId, token: 'invalid' },
  ]) {
    assert.throws(() => requireClassificationPreparationRequest(input), {
      code: 'INVALID_INPUT',
    })
  }
  const page = {
    sampleId,
    sampleName: 'Kick',
    token: 'a'.repeat(64),
    proposalCount: 0,
    ambiguityCount: 0,
    total: 0,
    items: [],
    limit: 50,
    offset: 0,
  }
  assert.equal(isClassificationPreparationPage(page), true)
  assert.equal(isClassificationPreparationPage({ ...page, token: '' }), false)
  assert.equal(
    isClassificationPreparationPage({ ...page, proposalCount: -1 }),
    false,
  )
  assert.equal(
    isClassificationPreparationPage({
      ...page,
      total: 1,
      items: [{ kind: 'proposal' }],
    }),
    false,
  )
})
