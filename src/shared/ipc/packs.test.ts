import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isFolderSelectionList } from './dialog.ts'
import {
  isPack,
  isPackDetail,
  isPackImportCandidatesPage,
  isPackImportReview,
  isPackListPage,
  isPackSamplesPage,
  requirePackDetailRequest,
  requirePackImportCandidatesRequest,
  requirePackImportRequest,
  requirePackListRequest,
  requirePackPrepareImportRequest,
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
const IMPORT_REVIEW_TOKEN = 'a'.repeat(64)
const IMPORT_REVIEW = {
  sourceRootId: '00000000-0000-4000-8000-000000000009',
  pack: null,
  sampleCount: 3,
  conflictCount: 0,
  token: IMPORT_REVIEW_TOKEN,
}
// A Pack stores no source root path; only list rows carry it.
const IMPORT_PACK = {
  id: '00000000-0000-4000-8000-000000000011',
  sourceRootId: IMPORT_REVIEW.sourceRootId,
  name: 'Analog Drums',
  description: null,
  coverAssetId: null,
}
const IMPORT_CANDIDATE = { ...SAMPLE, conflict: false }
const IMPORT_CANDIDATE_PAGE = {
  items: [IMPORT_CANDIDATE],
  total: 1,
  limit: 50,
  offset: 0,
}

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

test('Pack import preparation requests accept only the selected directory', () => {
  const directory = '/library/analog-drums'
  assert.deepEqual(requirePackPrepareImportRequest({ directory }), {
    directory,
  })
  for (const request of [
    undefined,
    null,
    [],
    {},
    { directory: '' },
    { directory: null },
    { directory: 42 },
    { path: directory },
    { directory, recursive: true },
  ]) {
    assert.throws(() => requirePackPrepareImportRequest(request), {
      name: 'DomainValidationError',
      message: 'Invalid Pack import preparation request.',
    })
  }
})

test('Pack import preparation replies accept a complete folder review', () => {
  assert.equal(isPackImportReview(IMPORT_REVIEW), true)
  assert.equal(
    isPackImportReview({
      ...IMPORT_REVIEW,
      pack: IMPORT_PACK,
      sampleCount: 2,
      conflictCount: 2,
    }),
    true,
  )
  assert.equal(
    isPackImportReview({
      ...IMPORT_REVIEW,
      pack: { ...IMPORT_PACK, description: 'Drums', coverAssetId: null },
    }),
    true,
  )
})

test('Pack import preparation replies reject malformed reviews', () => {
  for (const value of [
    null,
    [],
    { ...IMPORT_REVIEW, token: undefined },
    { ...IMPORT_REVIEW, token: 'a'.repeat(63) },
    { ...IMPORT_REVIEW, token: 'A'.repeat(64) },
    { ...IMPORT_REVIEW, token: 1 },
    { ...IMPORT_REVIEW, sourceRootId: '/library/analog-drums' },
    { ...IMPORT_REVIEW, pack: undefined },
    { ...IMPORT_REVIEW, pack: { ...IMPORT_PACK, sourceRootPath: '/x' } },
    { ...IMPORT_REVIEW, sampleCount: -1 },
    { ...IMPORT_REVIEW, sampleCount: 1.5 },
    { ...IMPORT_REVIEW, conflictCount: -1 },
    { ...IMPORT_REVIEW, sampleCount: 1, conflictCount: 2 },
    { ...IMPORT_REVIEW, conflicts: [] },
  ]) {
    assert.equal(isPackImportReview(value), false, JSON.stringify(value))
  }
})

test('Pack import candidate requests reuse the bounded Pack page rules', () => {
  const sourceRootId = IMPORT_REVIEW.sourceRootId
  assert.deepEqual(requirePackImportCandidatesRequest({ sourceRootId }), {
    sourceRootId,
    limit: 50,
    offset: 0,
  })
  assert.deepEqual(
    requirePackImportCandidatesRequest({ sourceRootId, limit: 100, offset: 4 }),
    { sourceRootId, limit: 100, offset: 4 },
  )
  for (const request of [
    undefined,
    null,
    [],
    {},
    { limit: 2 },
    { id: sourceRootId },
    { sourceRootId: null },
    { sourceRootId: '/library/analog-drums' },
  ]) {
    assert.throws(() => requirePackImportCandidatesRequest(request), {
      name: 'DomainValidationError',
      message: 'Invalid Pack import candidate request.',
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
      () => requirePackImportCandidatesRequest({ sourceRootId, ...request }),
      {
        name: 'DomainValidationError',
        message: 'Invalid Pack page request.',
      },
    )
  }
})

test('Pack import candidate replies accept a bounded page that flags conflicts', () => {
  assert.equal(isPackImportCandidatesPage(IMPORT_CANDIDATE_PAGE), true)
  assert.equal(
    isPackImportCandidatesPage({ items: [], total: 0, limit: 50, offset: 0 }),
    true,
  )
  assert.equal(
    isPackImportCandidatesPage({
      items: [
        { ...IMPORT_CANDIDATE, conflict: true },
        {
          ...IMPORT_CANDIDATE,
          sampleId: '00000000-0000-4000-8000-000000000008',
        },
      ],
      total: 9,
      limit: 50,
      offset: 0,
    }),
    true,
  )
})

test('Pack import candidate replies reject malformed rows and truncated pages', () => {
  for (const value of [
    null,
    [],
    { items: [], total: 0, limit: 50 },
    { ...IMPORT_CANDIDATE_PAGE, total: -1 },
    { ...IMPORT_CANDIDATE_PAGE, limit: 0 },
    { ...IMPORT_CANDIDATE_PAGE, limit: 101 },
    { ...IMPORT_CANDIDATE_PAGE, offset: -1 },
    {
      ...IMPORT_CANDIDATE_PAGE,
      items: [IMPORT_CANDIDATE, IMPORT_CANDIDATE],
    },
    { ...IMPORT_CANDIDATE_PAGE, total: 5, offset: 5 },
  ]) {
    assert.equal(
      isPackImportCandidatesPage(value),
      false,
      JSON.stringify(value),
    )
  }
  for (const candidate of [
    { ...IMPORT_CANDIDATE, conflict: undefined },
    { ...IMPORT_CANDIDATE, conflict: 'yes' },
    { ...IMPORT_CANDIDATE, path: '' },
    { ...IMPORT_CANDIDATE, originAssignment: 'guess' },
    { ...IMPORT_CANDIDATE, sampleId: 'kick.wav' },
  ]) {
    assert.equal(
      isPackImportCandidatesPage({
        ...IMPORT_CANDIDATE_PAGE,
        items: [candidate],
      }),
      false,
      JSON.stringify(candidate),
    )
  }
  assert.equal(
    isPackImportCandidatesPage({
      ...IMPORT_CANDIDATE_PAGE,
      items: [{ ...IMPORT_CANDIDATE, decision: 'keep' }],
    }),
    false,
    'Unknown candidate fields are rejected',
  )
  assert.equal(
    isPackImportCandidatesPage({ ...IMPORT_CANDIDATE_PAGE, nextOffset: 1 }),
    false,
  )
})

test('Pack import commit requests require a token, a normalized name and one decision per conflict', () => {
  const conflictId = '00000000-0000-4000-8000-000000000010'
  const request = {
    sourceRootId: IMPORT_REVIEW.sourceRootId,
    token: IMPORT_REVIEW.token,
    name: 'Analog Drums',
    decisions: [{ sampleId: conflictId, resolution: 'keep' }],
  }
  assert.deepEqual(requirePackImportRequest(request), request)
  assert.deepEqual(
    requirePackImportRequest({
      ...request,
      description: 'Collected one-shot drums.',
      decisions: [{ sampleId: conflictId, resolution: 'assign' }],
    }),
    {
      ...request,
      description: 'Collected one-shot drums.',
      decisions: [{ sampleId: conflictId, resolution: 'assign' }],
    },
  )
  assert.deepEqual(
    requirePackImportRequest({ ...request, description: null, decisions: [] }),
    { ...request, description: null, decisions: [] },
  )
  for (const forged of [
    undefined,
    null,
    [],
    {},
    { ...request, token: undefined },
    { ...request, token: '' },
    { ...request, token: 'a'.repeat(63) },
    { ...request, token: 'g'.repeat(64) },
    { ...request, token: 'A'.repeat(64) },
    { ...request, token: 42 },
    { ...request, name: ` ${request.name}` },
    { ...request, name: '' },
    { ...request, name: '   ' },
    { ...request, name: 'a'.repeat(121) },
    { ...request, name: 'Drums\u0000' },
    { ...request, name: undefined },
    { ...request, description: 'Drums\u0000' },
    { ...request, description: '  ' },
    { ...request, description: 42 },
    { ...request, decisions: undefined },
    { ...request, decisions: null },
    { ...request, decisions: {} },
    { ...request, decisions: [{ sampleId: conflictId, resolution: 'guess' }] },
    { ...request, decisions: [{ resolution: 'keep' }] },
    { ...request, decisions: [{ sampleId: 'kick.wav', resolution: 'keep' }] },
    {
      ...request,
      decisions: [
        { sampleId: conflictId, resolution: 'keep' },
        { sampleId: conflictId, resolution: 'assign' },
      ],
    },
  ]) {
    assert.throws(() => requirePackImportRequest(forged), {
      name: 'DomainValidationError',
      message: 'Invalid Pack import request.',
    })
  }
})

test('Pack import commit requests reject fields the contract does not promise', () => {
  const request = {
    sourceRootId: IMPORT_REVIEW.sourceRootId,
    token: IMPORT_REVIEW.token,
    name: 'Analog Drums',
    decisions: [],
  }
  for (const forged of [
    { ...request, id: IMPORT_PACK.id },
    { ...request, coverAssetId: null },
    { ...request, sampleCount: 1 },
    { ...request, decisions: [], keep: true },
    {
      ...request,
      decisions: [
        {
          sampleId: '00000000-0000-4000-8000-000000000010',
          resolution: 'keep',
          packId: null,
        },
      ],
    },
  ]) {
    assert.throws(() => requirePackImportRequest(forged), {
      name: 'DomainValidationError',
      message: 'Invalid Pack import request.',
    })
  }
})

test('Pack import commit replies accept the created Pack', () => {
  assert.equal(isPack(IMPORT_PACK), true)
  assert.equal(
    isPack({ ...IMPORT_PACK, description: null, coverAssetId: null }),
    true,
  )
  for (const value of [
    null,
    [],
    {},
    { ...IMPORT_PACK, sourceRootPath: '/library/analog-drums' },
    { ...IMPORT_PACK, name: ` ${IMPORT_PACK.name}` },
    { ...IMPORT_PACK, description: undefined },
    { ...IMPORT_PACK, coverAssetId: 'cover.png' },
    { ...IMPORT_PACK, id: 'analog-drums' },
    { ...IMPORT_PACK, sourceRootId: null },
  ]) {
    assert.equal(isPack(value), false, JSON.stringify(value))
  }
})

test('The multi-folder picker reply lists selected folders in order', () => {
  assert.equal(isFolderSelectionList([]), true)
  assert.equal(
    isFolderSelectionList(['/library/analog-drums', '/library/breaks']),
    true,
  )
  for (const value of [
    null,
    undefined,
    '/library/analog-drums',
    [''],
    [42],
    [null],
    ['/library/analog-drums', ''],
    [['/library/analog-drums']],
    { items: ['/library/analog-drums'] },
  ]) {
    assert.equal(isFolderSelectionList(value), false, JSON.stringify(value))
  }
  assert.equal(
    isFolderSelectionList(['/library/analog-drums', '/library/analog-drums']),
    false,
    'The same folder cannot be selected twice',
  )
})
