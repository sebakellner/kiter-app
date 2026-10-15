import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isCategory,
  isCategoryPage,
  requireCategoryCreateRequest,
  requireCategoryListRequest,
  requireCategoryRenameRequest,
} from './categories.ts'
import { DomainValidationError } from '../domain/validation.ts'
import { IpcError, requireIpcResult } from './result.ts'

const id = '00000000-0000-4000-8000-000000000001'
const category = { id, name: 'Percusión' }

test('Category requests reuse Unicode name and bounded literal-search rules', () => {
  assert.deepEqual(
    requireCategoryCreateRequest({ name: ' Percusio\u0301n ' }),
    {
      name: 'Percusión',
    },
  )
  assert.deepEqual(requireCategoryRenameRequest({ id, name: ' DRUMS ' }), {
    id,
    name: 'DRUMS',
  })
  assert.deepEqual(requireCategoryListRequest({}), {
    search: '',
    limit: 50,
    offset: 0,
  })
  assert.deepEqual(
    requireCategoryListRequest({
      search: ' E\u0301_% ',
      limit: 100,
      offset: 2,
    }),
    { search: 'é_%', limit: 100, offset: 2 },
  )
  assert.deepEqual(requireCategoryCreateRequest({ name: '🎵'.repeat(120) }), {
    name: '🎵'.repeat(120),
  })
})

test('Category requests reject malformed names, identifiers and pages', () => {
  for (const value of [
    undefined,
    null,
    [],
    {},
    { name: 1 },
    { name: ' ' },
    { name: '\nDrums' },
    { name: 'Drums\u2028' },
    { name: 'a'.repeat(121) },
  ]) {
    assert.throws(
      () => requireCategoryCreateRequest(value),
      DomainValidationError,
    )
    assert.throws(
      () => requireCategoryRenameRequest(value),
      DomainValidationError,
    )
  }
  for (const badId of [undefined, null, '', 'invalid', 1]) {
    assert.throws(
      () => requireCategoryRenameRequest({ id: badId, name: 'Drums' }),
      DomainValidationError,
    )
  }
  for (const value of [
    undefined,
    null,
    [],
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { limit: '50' },
    { offset: -1 },
    { offset: Number.MAX_SAFE_INTEGER + 1 },
    { search: null },
    { search: '\n' },
    { search: 'a'.repeat(121) },
  ]) {
    assert.throws(
      () => requireCategoryListRequest(value),
      DomainValidationError,
    )
  }
})

test('Category response validation rejects malformed or non-normalized data', () => {
  assert.equal(isCategory(category), true)
  for (const value of [
    null,
    { ...category, id: 'invalid' },
    { ...category, name: ' Percusión ' },
    { ...category, name: 'Percusio\u0301n' },
    { ...category, name: '' },
    { ...category, name: 1 },
  ]) {
    assert.equal(isCategory(value), false)
    assert.throws(
      () => requireIpcResult({ ok: true, data: value }, isCategory),
      (error: unknown) =>
        error instanceof IpcError && error.code === 'PROTOCOL_ERROR',
    )
  }
})

test('Category page responses require complete and consistent pagination metadata', () => {
  const page = { items: [category], total: 1, limit: 50, offset: 0 }
  assert.deepEqual(requireIpcResult({ ok: true, data: page }, isCategoryPage), {
    ok: true,
    data: page,
  })
  assert.equal(
    isCategoryPage({ items: [], total: 0, limit: 50, offset: 10 }),
    true,
  )
  for (const value of [
    null,
    { items: [], total: 0 },
    { ...page, items: [null] },
    { ...page, items: null },
    { ...page, total: 0 },
    { ...page, total: -1 },
    { ...page, total: 1.5 },
    { ...page, total: Number.MAX_SAFE_INTEGER + 1 },
    { ...page, limit: 101 },
    { ...page, limit: 0 },
    { ...page, offset: 1 },
    { ...page, offset: -1 },
    { ...page, items: [category, category], total: 2, limit: 1 },
  ]) {
    assert.equal(isCategoryPage(value), false)
  }
})
