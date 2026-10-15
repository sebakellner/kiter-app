import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import {
  isAudioSamples,
  isImportFolderRequest,
  isSetFavoriteRequest,
} from './library.ts'

test('library IPC guards reject malformed requests and unauthorized URL shapes', () => {
  const id = randomUUID()
  assert.ok(isImportFolderRequest({ directory: '/selected' }))
  assert.ok(isSetFavoriteRequest({ id, favorite: false }))
  for (const value of [null, '', { directory: '' }, { directory: 5 }]) {
    assert.equal(isImportFolderRequest(value), false)
  }
  for (const value of [
    null,
    { id, favorite: 'true' },
    { id: 'invalid', favorite: true },
  ]) {
    assert.equal(isSetFavoriteRequest(value), false)
  }
  assert.equal(
    isAudioSamples([
      {
        id,
        favorite: false,
        name: 'sample',
        path: '/sample.wav',
        relativePath: 'sample.wav',
        audioUrl: 'file:///sample.wav',
      },
    ]),
    false,
  )
})
