import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import {
  isAudioSamples,
  isImportFolderRequest,
  isSetFavoriteRequest,
  isLibraryPage,
  requireLibraryListRequest,
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

test('catalog IPC validates bounded pages and distinguishes unavailable audio from empty results', () => {
  assert.deepEqual(requireLibraryListRequest({}), {
    limit: 50,
    offset: 0,
    favoritesOnly: false,
  })
  for (const input of [
    null,
    { limit: 101 },
    { offset: -1 },
    { favoritesOnly: 'true' },
    { categoryIds: null },
    { categoryIds: ['/file.wav'] },
    { categoryIds: Array.from({ length: 101 }, () => randomUUID()) },
    { genreIds: null },
    { genreIds: ['/file.wav'] },
    { genreIds: Array.from({ length: 101 }, () => randomUUID()) },
  ]) {
    assert.throws(() => requireLibraryListRequest(input))
  }
  const categoryId = randomUUID()
  const genreId = randomUUID()
  assert.throws(() =>
    requireLibraryListRequest({ genreIds: [genreId, genreId] }),
  )
  assert.deepEqual(
    requireLibraryListRequest({
      categoryIds: [categoryId],
      genreIds: [genreId],
    }),
    {
      limit: 50,
      offset: 0,
      favoritesOnly: false,
      categoryIds: [categoryId],
      genreIds: [genreId],
    },
  )
  assert.deepEqual(
    requireLibraryListRequest({ genreIds: [] }),
    requireLibraryListRequest({}),
  )
  assert.throws(() =>
    requireLibraryListRequest({ categoryIds: [categoryId, categoryId] }),
  )
  assert.deepEqual(
    requireLibraryListRequest({ categoryIds: [categoryId] }).categoryIds,
    [categoryId],
  )
  const item = {
    id: randomUUID(),
    favorite: true,
    name: 'kick.wav',
    path: '/samples/kick.wav',
    relativePath: 'kick.wav',
    rootPath: '/samples',
    sourceRevision: 1,
    audioUrl: null,
    unavailableReason: 'Audio unavailable.',
  }
  const page = { items: [item], total: 1, limit: 50, offset: 0 }
  assert.ok(isLibraryPage(page))
  assert.equal(isLibraryPage({ ...page, total: 0 }), false)
  assert.equal(
    isLibraryPage({
      ...page,
      items: [{ ...item, audioUrl: 'file:///samples/kick.wav' }],
    }),
    false,
  )
  assert.equal(
    isLibraryPage({ ...page, items: [{ ...item, unavailableReason: null }] }),
    false,
  )
})
