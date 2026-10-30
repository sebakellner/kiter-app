import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPackListPage, requirePackListRequest } from './packs.ts'

const PACK = {
  id: '00000000-0000-4000-8000-000000000001',
  sourceRootId: '00000000-0000-4000-8000-000000000002',
  name: 'Analog Drums',
  description: 'Collected one-shot drums.',
  coverAssetId: '00000000-0000-4000-8000-000000000003',
  sourceRootPath: '/library/analog-drums',
}
const PAGE = { items: [PACK], total: 1, limit: 50, offset: 0 }

test('Pack list requests reuse the bounded Pack page rules', () => {
  assert.deepEqual(requirePackListRequest({}), { limit: 50, offset: 0 })
  assert.deepEqual(requirePackListRequest({ limit: 2, offset: 3 }), {
    limit: 2,
    offset: 3,
  })
  assert.deepEqual(requirePackListRequest({ limit: 100 }), {
    limit: 100,
    offset: 0,
  })
  for (const request of [
    undefined,
    null,
    [],
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { limit: '2' },
    { offset: -1 },
    { offset: 0.5 },
    { offset: '0' },
  ]) {
    assert.throws(() => requirePackListRequest(request), {
      name: 'DomainValidationError',
      message: 'Invalid Pack page request.',
    })
  }
})

test('Pack list replies accept a bounded page of complete Packs', () => {
  assert.equal(isPackListPage(PAGE), true)
  assert.equal(
    isPackListPage({ items: [], total: 0, limit: 50, offset: 0 }),
    true,
  )
  assert.equal(
    isPackListPage({
      items: [{ ...PACK, description: null, coverAssetId: null }],
      total: 1,
      limit: 1,
      offset: 0,
    }),
    true,
  )
  assert.equal(isPackListPage({ ...PAGE, limit: 1, offset: 0, total: 1 }), true)
})

test('Pack list replies reject unresolved paging and malformed Packs', () => {
  for (const value of [
    null,
    [],
    { items: [PACK], total: 1, limit: 50 },
    { ...PAGE, total: -1 },
    { ...PAGE, total: 1.5 },
    { ...PAGE, limit: 0 },
    { ...PAGE, limit: 101 },
    { ...PAGE, offset: -1 },
    { ...PAGE, items: [PACK, PACK] },
    { ...PAGE, total: 5, offset: 5 },
  ]) {
    assert.equal(isPackListPage(value), false, JSON.stringify(value))
  }
  for (const pack of [
    { ...PACK, id: '/library/pack' },
    { ...PACK, sourceRootId: null },
    { ...PACK, name: ` ${PACK.name}` },
    { ...PACK, name: 'a'.repeat(121) },
    { ...PACK, description: 'Drums\u0000' },
    { ...PACK, description: undefined },
    { ...PACK, coverAssetId: 'cover.png' },
  ]) {
    assert.equal(
      isPackListPage({ ...PAGE, items: [pack] }),
      false,
      JSON.stringify(pack),
    )
  }
})

test('Pack list replies require every row to carry its source root path', () => {
  const withoutPath = {
    id: PACK.id,
    sourceRootId: PACK.sourceRootId,
    name: PACK.name,
    description: PACK.description,
    coverAssetId: PACK.coverAssetId,
  }
  assert.equal(isPackListPage({ ...PAGE, items: [withoutPath] }), false)
  for (const sourceRootPath of ['', null, 42]) {
    assert.equal(
      isPackListPage({ ...PAGE, items: [{ ...PACK, sourceRootPath }] }),
      false,
      JSON.stringify(sourceRootPath),
    )
  }
  assert.equal(isPackListPage({ ...PAGE, items: [PACK] }), true)
})

test('Pack list replies reject fields the contract does not promise', () => {
  assert.equal(isPackListPage({ ...PAGE, nextOffset: null }), false)
  assert.equal(
    isPackListPage({ ...PAGE, items: [{ ...PACK, edit: true }] }),
    false,
  )
})
