import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isPackDetail,
  isPackListPage,
  isPackSamplesPage,
  requirePackDetailRequest,
  requirePackListRequest,
  requirePackSamplesRequest,
} from './packs.ts'

const PACK = {
  id: '00000000-0000-4000-8000-000000000001',
  sourceRootId: '00000000-0000-4000-8000-000000000002',
  name: 'Analog Drums',
  description: 'Collected one-shot drums.',
  coverAssetId: '00000000-0000-4000-8000-000000000003',
  sourceRootPath: '/library/analog-drums',
}
const PAGE = { items: [PACK], total: 1, limit: 50, offset: 0 }
const INSTRUMENT = {
  id: '00000000-0000-4000-8000-000000000004',
  name: 'Kick',
}
const AUTHOR = {
  id: '00000000-0000-4000-8000-000000000005',
  name: 'Ada Author',
}
const GENRE = { id: '00000000-0000-4000-8000-000000000006', name: 'Techno' }
const DETAIL = {
  pack: PACK,
  instruments: { items: [INSTRUMENT], total: 1, limit: 50, offset: 0 },
  authors: { items: [AUTHOR], total: 1, limit: 50, offset: 0 },
  genres: { items: [GENRE], total: 1, limit: 50, offset: 0 },
}
const SAMPLE = {
  sampleId: '00000000-0000-4000-8000-000000000007',
  packId: PACK.id,
  originAssignment: 'automatic',
  name: 'Kick 01.wav',
  path: '/library/analog-drums/Kick 01.wav',
}
const SAMPLE_PAGE = { items: [SAMPLE], total: 1, limit: 50, offset: 0 }

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

test('Pack detail requests accept only a Pack identifier', () => {
  assert.deepEqual(requirePackDetailRequest({ id: PACK.id }), { id: PACK.id })
  for (const request of [
    undefined,
    null,
    [],
    {},
    { id: null },
    { id: 42 },
    { id: '' },
    { id: '/library/analog-drums' },
    { id: PACK.name },
    { packId: PACK.id },
  ]) {
    assert.throws(() => requirePackDetailRequest(request), {
      name: 'DomainValidationError',
      message: 'Invalid Pack detail request.',
    })
  }
})

test('Pack detail replies accept the Pack with its bounded classifications', () => {
  assert.equal(isPackDetail(DETAIL), true)
  assert.equal(
    isPackDetail({
      pack: { ...PACK, description: null, coverAssetId: null },
      instruments: { items: [], total: 0, limit: 50, offset: 0 },
      authors: { items: [], total: 0, limit: 50, offset: 0 },
      genres: { items: [], total: 0, limit: 50, offset: 0 },
    }),
    true,
  )
  assert.equal(
    isPackDetail({
      ...DETAIL,
      instruments: { items: [INSTRUMENT], total: 3, limit: 1, offset: 0 },
    }),
    true,
    'A bounded page may echo a larger total',
  )
  assert.equal(
    isPackDetail({
      ...DETAIL,
      genres: { items: [], total: 4, limit: 50, offset: 4 },
    }),
    true,
  )
})

test('Pack detail replies reject malformed groups and truncated pages', () => {
  for (const value of [
    null,
    [],
    { ...DETAIL, genres: undefined },
    { ...DETAIL, instruments: null },
    { ...DETAIL, pack: { ...PACK, sourceRootPath: '' } },
    { ...DETAIL, pack: { ...PACK, name: ` ${PACK.name}` } },
    {
      ...DETAIL,
      instruments: {
        items: [INSTRUMENT, INSTRUMENT],
        total: 1,
        limit: 50,
        offset: 0,
      },
    },
    {
      ...DETAIL,
      authors: { items: [AUTHOR], total: -1, limit: 50, offset: 0 },
    },
    { ...DETAIL, authors: { items: [], total: 0, limit: 0, offset: 0 } },
    { ...DETAIL, genres: { items: [], total: 0, limit: 101, offset: 0 } },
    { ...DETAIL, genres: { items: [], total: 0, limit: 50, offset: -1 } },
    { ...DETAIL, genres: { items: [], total: 2 } },
  ]) {
    assert.equal(isPackDetail(value), false, JSON.stringify(value))
  }
  for (const item of [
    { ...INSTRUMENT, id: 'kick' },
    { ...INSTRUMENT, name: ` ${INSTRUMENT.name}` },
    { ...INSTRUMENT, name: 'a'.repeat(121) },
    { id: INSTRUMENT.id },
  ]) {
    assert.equal(
      isPackDetail({
        ...DETAIL,
        instruments: { ...DETAIL.instruments, items: [item] },
      }),
      false,
      JSON.stringify(item),
    )
  }
  for (const item of [
    { ...GENRE, name: 'Techno\u0000' },
    { ...GENRE, id: null },
  ]) {
    assert.equal(
      isPackDetail({ ...DETAIL, genres: { ...DETAIL.genres, items: [item] } }),
      false,
      JSON.stringify(item),
    )
  }
})

test('Pack detail replies reject fields the contract does not promise', () => {
  assert.equal(isPackDetail({ ...DETAIL, samples: SAMPLE_PAGE }), false)
  assert.equal(
    isPackDetail({ ...DETAIL, pack: { ...PACK, edit: true } }),
    false,
  )
  assert.equal(
    isPackDetail({
      ...DETAIL,
      instruments: {
        ...DETAIL.instruments,
        items: [{ ...INSTRUMENT, kind: 'pack' }],
      },
    }),
    false,
  )
  assert.equal(
    isPackDetail({ ...DETAIL, authors: { ...DETAIL.authors, search: '' } }),
    false,
  )
})

test('Pack Samples requests reuse the bounded Pack page rules', () => {
  assert.deepEqual(requirePackSamplesRequest({ id: PACK.id }), {
    id: PACK.id,
    limit: 50,
    offset: 0,
  })
  assert.deepEqual(requirePackSamplesRequest({ id: PACK.id, limit: 2 }), {
    id: PACK.id,
    limit: 2,
    offset: 0,
  })
  assert.deepEqual(
    requirePackSamplesRequest({ id: PACK.id, limit: 100, offset: 7 }),
    { id: PACK.id, limit: 100, offset: 7 },
  )
  for (const request of [
    undefined,
    null,
    [],
    {},
    { limit: 2 },
    { id: null },
    { id: '/library/analog-drums' },
  ]) {
    assert.throws(() => requirePackSamplesRequest(request), {
      name: 'DomainValidationError',
      message: 'Invalid Pack Samples request.',
    })
  }
  for (const request of [
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { limit: '2' },
    { offset: -1 },
    { offset: 0.5 },
    { offset: '0' },
  ]) {
    assert.throws(
      () => requirePackSamplesRequest({ id: PACK.id, ...request }),
      {
        name: 'DomainValidationError',
        message: 'Invalid Pack page request.',
      },
    )
  }
})

test('Pack Samples replies accept a bounded page of Samples under the Pack', () => {
  assert.equal(isPackSamplesPage(SAMPLE_PAGE), true)
  assert.equal(
    isPackSamplesPage({ items: [], total: 0, limit: 50, offset: 0 }),
    true,
  )
  assert.equal(
    isPackSamplesPage({
      items: [
        { ...SAMPLE, packId: null, originAssignment: 'manual' },
        { ...SAMPLE, sampleId: '00000000-0000-4000-8000-000000000008' },
      ],
      total: 9,
      limit: 50,
      offset: 0,
    }),
    true,
  )
  assert.equal(
    isPackSamplesPage({ items: [SAMPLE], total: 1, limit: 1, offset: 0 }),
    true,
  )
})

test('Pack Samples replies reject malformed rows and truncated pages', () => {
  for (const value of [
    null,
    [],
    { items: [SAMPLE], total: 1, limit: 50 },
    { ...SAMPLE_PAGE, total: -1 },
    { ...SAMPLE_PAGE, total: 1.5 },
    { ...SAMPLE_PAGE, limit: 0 },
    { ...SAMPLE_PAGE, limit: 101 },
    { ...SAMPLE_PAGE, offset: -1 },
    { ...SAMPLE_PAGE, items: [SAMPLE, SAMPLE] },
    { ...SAMPLE_PAGE, total: 5, offset: 5 },
  ]) {
    assert.equal(isPackSamplesPage(value), false, JSON.stringify(value))
  }
  for (const sample of [
    { ...SAMPLE, path: '' },
    { ...SAMPLE, name: '' },
    { ...SAMPLE, path: undefined },
    { ...SAMPLE, originAssignment: 'guess' },
    { ...SAMPLE, packId: 'analog-drums' },
    { ...SAMPLE, sampleId: 'kick.wav' },
  ]) {
    assert.equal(
      isPackSamplesPage({ ...SAMPLE_PAGE, items: [sample] }),
      false,
      JSON.stringify(sample),
    )
  }
})

test('Pack Samples replies reject fields the contract does not promise', () => {
  assert.equal(isPackSamplesPage({ ...SAMPLE_PAGE, nextOffset: 1 }), false)
  assert.equal(
    isPackSamplesPage({
      ...SAMPLE_PAGE,
      items: [{ ...SAMPLE, conflict: true }],
    }),
    false,
  )
  assert.equal(
    isPackSamplesPage({
      ...SAMPLE_PAGE,
      items: [{ ...SAMPLE, displayName: 'Kick' }],
    }),
    false,
  )
})
