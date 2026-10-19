import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  requireGenreListRequest,
  requireSampleGenresSaveRequest,
  isGenrePage,
  isSampleGenresSnapshot,
} from './genres.ts'

const id = '00000000-0000-4000-8000-000000000001'
const token = 'a'.repeat(64)

test('Genre contracts validate bounded pages, unique selection and saved snapshots', () => {
  assert.deepEqual(
    requireSampleGenresSaveRequest({ sampleId: id, token, genreIds: [] }),
    { sampleId: id, token, genreIds: [] },
  )
  for (const overrides of [
    { genreIds: [id, id] },
    { sampleId: '/file.wav' },
    { genreIds: Array.from({ length: 1001 }, () => id) },
    { token: 'invalid' },
  ]) {
    assert.throws(() =>
      requireSampleGenresSaveRequest({
        sampleId: id,
        token,
        genreIds: [],
        ...overrides,
      }),
    )
  }
  assert.throws(() => requireGenreListRequest({ limit: 101 }))
  assert.equal(
    isGenrePage({
      items: [{ id, name: 'House' }],
      total: 1,
      limit: 50,
      offset: 0,
    }),
    true,
  )
  assert.equal(
    isGenrePage({
      items: [{ id, name: ' House ' }],
      total: 1,
      limit: 50,
      offset: 0,
    }),
    false,
  )
  assert.equal(
    isSampleGenresSnapshot({
      sampleId: id,
      token,
      genres: [
        { id, name: 'House' },
        { id, name: 'House' },
      ],
    }),
    false,
  )
})
