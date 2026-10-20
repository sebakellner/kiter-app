import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { suggestPackDetails } from './pack-details.ts'

test('Pack name suggestions use domain normalization without changing their source folder', () => {
  assert.deepEqual(suggestPackDetails(path.join('source', '  Cafe\u0301  ')), {
    name: 'Café',
    description: null,
  })
  const maximum = '🎵'.repeat(120)
  assert.deepEqual(suggestPackDetails(path.join('source', maximum)), {
    name: maximum,
    description: null,
  })
})

test('invalid folder-name suggestions retain their exact text and expose a draft issue immediately', () => {
  for (const name of [
    'a'.repeat(121),
    '🎵'.repeat(121),
    'Control\nName',
    '   ',
  ]) {
    assert.deepEqual(suggestPackDetails(path.join('source', name)), {
      name,
      description: null,
      nameIssue: 'INVALID_NAME',
    })
  }
})
