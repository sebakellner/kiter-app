import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import {
  isAudioSamples,
  isImportFolderRequest,
  isSetFavoriteRequest,
  isLibraryPage,
  isCatalogSample,
  requireLibraryListRequest,
} from './library.ts'
import { makeAudioSample } from '../../../tests/support/fixtures/audio-sample.ts'

test('catalog classification summaries validate bounded labels, counts and sample type', () => {
  const sample = {
    ...makeAudioSample(),
    rootPath: null,
    sourceRevision: 1,
  }
  const classification = {
    instruments: ['Piano'],
    genres: ['Ambient'],
    sampleType: 'loop',
    additionalInstrumentCount: 3,
    additionalGenreCount: 1,
  }
  assert.ok(isCatalogSample({ ...sample, classification }))
  assert.ok(isCatalogSample(sample))
  for (const invalid of [
    null,
    { ...classification, instruments: ['a', 'b', 'c'] },
    { ...classification, genres: [123] },
    { ...classification, sampleType: 'automatic' },
    { ...classification, additionalInstrumentCount: -1 },
    { ...classification, additionalInstrumentCount: 1.5 },
    { ...classification, additionalInstrumentCount: undefined },
    { ...classification, additionalGenreCount: -1 },
    { ...classification, additionalGenreCount: 1.5 },
    { ...classification, additionalGenreCount: undefined },
  ]) {
    assert.equal(isCatalogSample({ ...sample, classification: invalid }), false)
  }
})

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
    { collectionId: null },
    { collectionId: '/arbitrary/collection' },
    { instrumentIds: null },
    { instrumentIds: ['/file.wav'] },
    { instrumentIds: Array.from({ length: 101 }, () => randomUUID()) },
    { genreIds: null },
    { genreIds: ['/file.wav'] },
    { genreIds: Array.from({ length: 101 }, () => randomUUID()) },
  ]) {
    assert.throws(() => requireLibraryListRequest(input))
  }
  const instrumentId = randomUUID()
  const genreId = randomUUID()
  assert.throws(() =>
    requireLibraryListRequest({ genreIds: [genreId, genreId] }),
  )
  assert.deepEqual(
    requireLibraryListRequest({
      instrumentIds: [instrumentId],
      genreIds: [genreId],
    }),
    {
      limit: 50,
      offset: 0,
      favoritesOnly: false,
      instrumentIds: [instrumentId],
      genreIds: [genreId],
    },
  )
  assert.deepEqual(
    requireLibraryListRequest({ genreIds: [] }),
    requireLibraryListRequest({}),
  )
  assert.throws(() =>
    requireLibraryListRequest({ instrumentIds: [instrumentId, instrumentId] }),
  )
  assert.deepEqual(
    requireLibraryListRequest({ instrumentIds: [instrumentId] }).instrumentIds,
    [instrumentId],
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
  assert.ok(isLibraryPage({ ...page, collectionOrderToken: 'a'.repeat(64) }))
  assert.equal(isLibraryPage({ ...page, collectionOrderToken: null }), false)
  assert.equal(
    isLibraryPage({ ...page, collectionOrderToken: 'invalid' }),
    false,
  )
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

test('Sample type filters validate fixed unique choices and preserve combined filters', () => {
  const instrumentId = randomUUID()
  const genreId = randomUUID()
  const request = {
    instrumentIds: [instrumentId],
    genreIds: [genreId],
    sampleTypes: ['loop', 'one-shot', 'unknown'],
    favoritesOnly: true,
    limit: 2,
    offset: 2,
  }
  assert.deepEqual(requireLibraryListRequest(request), request)
  assert.deepEqual(
    requireLibraryListRequest({ sampleTypes: [] }),
    requireLibraryListRequest({}),
  )
  for (const sampleTypes of [
    null,
    'loop',
    [null],
    ['Loop'],
    ['one shot'],
    ['invalid'],
    ['loop', 'loop'],
    ['unknown', 'unknown'],
    ['loop', 'one-shot', 'unknown', 'loop'],
  ]) {
    assert.throws(() => requireLibraryListRequest({ sampleTypes }), {
      name: 'DomainValidationError',
    })
  }
})

test('catalog search validates bounded plain text, normalizes Unicode and ignores empty or one-character input', () => {
  assert.equal(
    requireLibraryListRequest({ search: '  PÉRCU\u0301SSION  kick\\808  ' })
      .search,
    'percussion kick/808',
  )
  for (const search of ['', '  ', 'á', ' a ']) {
    assert.deepEqual(
      requireLibraryListRequest({ search }),
      requireLibraryListRequest({}),
    )
  }
  assert.equal(
    requireLibraryListRequest({ search: 'a'.repeat(500) }).search?.length,
    500,
  )
  const unicodeRequest = requireLibraryListRequest({ search: '한'.repeat(500) })
  assert.deepEqual(requireLibraryListRequest(unicodeRequest), unicodeRequest)
  assert.equal(
    requireLibraryListRequest({ search: 'hi '.repeat(32) }).search?.split(' ')
      .length,
    32,
  )
  for (const search of [
    null,
    5,
    {},
    [],
    'a'.repeat(501),
    'hi '.repeat(33),
    'kick\u0000',
    'kick\u001b',
  ]) {
    assert.throws(() => requireLibraryListRequest({ search }), {
      name: 'DomainValidationError',
    })
  }
})
