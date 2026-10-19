import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  requireSampleCategoriesRequest,
  requireSampleCategoriesSaveRequest,
  isSampleCategoriesSnapshot,
} from './sampleCategories.ts'

const id = '00000000-0000-4000-8000-000000000001'
const token = 'a'.repeat(64)

test('manual category contracts accept clearing and reject duplicate, unbounded or forged identities', () => {
  assert.deepEqual(
    requireSampleCategoriesSaveRequest({
      sampleId: id,
      token,
      categoryIds: [],
    }),
    { sampleId: id, token, categoryIds: [] },
  )
  assert.throws(() => requireSampleCategoriesRequest({ sampleId: '/file.wav' }))
  for (const overrides of [
    { token: 'invalid' },
    { categoryIds: [id, id] },
    { categoryIds: ['/file.wav'] },
    { categoryIds: Array.from({ length: 1001 }, () => id) },
  ]) {
    assert.throws(() =>
      requireSampleCategoriesSaveRequest({
        sampleId: id,
        token,
        categoryIds: [],
        ...overrides,
      }),
    )
  }
  assert.equal(
    isSampleCategoriesSnapshot({ sampleId: id, token, categories: [] }),
    true,
  )
  assert.equal(
    isSampleCategoriesSnapshot({
      sampleId: id,
      token,
      categories: [
        { id, name: 'Kick' },
        { id, name: 'Kick' },
      ],
    }),
    false,
  )
})
