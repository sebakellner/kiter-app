import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeCollectionSummary } from '../../../tests/support/fixtures/collection.ts'
import {
  isCollection,
  isCollectionPage,
  isCollectionSummary,
  requireCollectionCreateRequest,
  requireCollectionGetRequest,
  requireCollectionDestinationsRequest,
  requireCollectionMembershipRequest,
  isCollectionDestinationPage,
  isCollectionMembershipResult,
  requireCollectionMoveRequest,
  isCollectionMoveResult,
  requireCollectionPlaceRequest,
  requireCollectionUpdateRequest,
  requireCollectionRemovalRequest,
  isCollectionRemovalReview,
  isCollectionRemovalResult,
} from './collections.ts'
import { requireCollectionPage } from '../domain/collection.ts'

test('Collection editing requires saved presentation and deletion requires a reviewed token', () => {
  const collection = makeCollectionSummary()
  const input = {
    id: collection.id,
    name: ' New name ',
    description: '',
    expected: { name: collection.name, description: collection.description },
  }
  assert.deepEqual(requireCollectionUpdateRequest(input), {
    ...input,
    name: 'New name',
    description: null,
  })
  for (const invalid of [
    null,
    {},
    { ...input, id: '/path' },
    { ...input, expected: undefined },
    { ...input, expected: { name: 'Saved' } },
    { ...input, name: ' ' },
  ]) {
    assert.throws(() => requireCollectionUpdateRequest(invalid), {
      code: 'INVALID_INPUT',
    })
  }
  const request = { id: collection.id, token: 'a'.repeat(64) }
  assert.deepEqual(requireCollectionRemovalRequest(request), request)
  for (const invalid of [
    { ...request, id: 'no' },
    { ...request, token: '' },
    { id: collection.id },
  ]) {
    assert.throws(() => requireCollectionRemovalRequest(invalid), {
      code: 'INVALID_INPUT',
    })
  }
  const review = { entity: collection, sampleCount: 2, token: request.token }
  assert.equal(isCollectionRemovalReview(review), true)
  assert.equal(isCollectionRemovalReview({ ...review, sampleCount: -1 }), false)
  assert.equal(
    isCollectionRemovalReview({ ...review, token: 'invalid' }),
    false,
  )
  assert.equal(isCollectionRemovalResult({ id: collection.id }), true)
  assert.equal(isCollectionRemovalResult({ id: '/file' }), false)
})

test('Collection IPC creation reuses Unicode name/description rules and rejects malformed input', () => {
  assert.deepEqual(
    requireCollectionCreateRequest({
      name: ' E\u0301lectro ',
      description: ' Line one\nLine two ',
    }),
    {
      name: 'Électro',
      description: ' Line one\nLine two ',
    },
  )
  assert.deepEqual(requireCollectionCreateRequest({ name: 'Picks' }), {
    name: 'Picks',
    description: null,
  })
  assert.equal(
    requireCollectionCreateRequest({ name: '😀'.repeat(120) }).name,
    '😀'.repeat(120),
  )
  assert.equal(
    requireCollectionCreateRequest({
      name: 'Picks',
      description: '😀'.repeat(5000),
    }).description,
    '😀'.repeat(5000),
  )
  for (const value of [
    null,
    [],
    {},
    { name: ' ' },
    { name: 'a\nb' },
    { name: 'a\t' },
    { name: '😀'.repeat(121) },
    { name: 'Picks', description: 1 },
    { name: 'Picks', description: 'a\tb' },
    { name: 'Picks', description: '😀'.repeat(5001) },
  ]) {
    assert.throws(() => requireCollectionCreateRequest(value), {
      code: 'INVALID_INPUT',
    })
  }
})

test('Collection drops validate both member identities, explicit placement and the drag-start snapshot', () => {
  const { id } = makeCollectionSummary()
  const request = {
    collectionId: id,
    sampleId: id,
    targetSampleId: id,
    placement: 'before',
    token: 'a'.repeat(64),
  }
  assert.deepEqual(requireCollectionPlaceRequest(request), request)
  for (const invalid of [
    null,
    {},
    { ...request, targetSampleId: null },
    { ...request, targetSampleId: '/file.wav' },
    { ...request, placement: 'first' },
    { ...request, token: '' },
  ]) {
    assert.throws(() => requireCollectionPlaceRequest(invalid), {
      code: 'INVALID_INPUT',
    })
  }
})

test('Collection moves require an exact read token, one direction and catalog identities', () => {
  const { id } = makeCollectionSummary()
  const request = {
    collectionId: id,
    sampleId: id,
    direction: 'up',
    token: 'a'.repeat(64),
  }
  assert.deepEqual(requireCollectionMoveRequest(request), request)
  for (const invalid of [
    null,
    {},
    { ...request, collectionId: '/path' },
    { ...request, sampleId: null },
    { ...request, direction: 'left' },
    { ...request, token: '' },
    { ...request, token: 'a'.repeat(63) },
  ]) {
    assert.throws(() => requireCollectionMoveRequest(invalid), {
      code: 'INVALID_INPUT',
    })
  }
  const result = {
    collectionId: id,
    sampleId: id,
    changed: true,
    index: 50,
    orderToken: request.token,
  }
  assert.equal(isCollectionMoveResult(result), true)
  for (const invalid of [
    { ...result, index: -1 },
    { ...result, index: 0.5 },
    { ...result, index: Number.MAX_SAFE_INTEGER + 1 },
    { ...result, changed: undefined },
    { ...result, orderToken: null },
    { ...result, sampleId: '/path' },
  ]) {
    assert.equal(isCollectionMoveResult(invalid), false)
  }
})

test('Collection destination and membership contracts validate identities, bounded literal search and actual outcomes', () => {
  const { id } = makeCollectionSummary()
  assert.deepEqual(requireCollectionDestinationsRequest({}), {
    sampleId: undefined,
    search: '',
    limit: 50,
    offset: 0,
  })
  assert.deepEqual(
    requireCollectionDestinationsRequest({
      sampleId: id,
      search: ' TÉXTURES ',
    }),
    { sampleId: id, search: 'textures', limit: 50, offset: 0 },
  )
  assert.deepEqual(
    requireCollectionMembershipRequest({
      collectionId: id,
      sampleId: id,
      assigned: false,
    }),
    { collectionId: id, sampleId: id, assigned: false },
  )
  for (const input of [
    null,
    { sampleId: '/audio.wav' },
    { sampleId: id, search: null },
    { sampleId: id, search: 'a'.repeat(121) },
    { sampleId: id, search: 'bad\nquery' },
    { sampleId: id, limit: 101 },
    { sampleId: id, offset: -1 },
  ]) {
    assert.throws(() => requireCollectionDestinationsRequest(input), {
      code: 'INVALID_INPUT',
    })
  }
  for (const input of [
    null,
    {},
    { collectionId: id, sampleId: '/audio.wav', assigned: true },
    { collectionId: id, sampleId: id, assigned: 'true' },
  ]) {
    assert.throws(() => requireCollectionMembershipRequest(input), {
      code: 'INVALID_INPUT',
    })
  }
  const page = {
    items: [{ ...makeCollectionSummary(), assigned: true }],
    total: 1,
    offset: 0,
    limit: 50,
  }
  assert.equal(isCollectionDestinationPage(page), true)
  assert.equal(
    isCollectionDestinationPage({ ...page, items: [makeCollectionSummary()] }),
    false,
  )
  assert.equal(
    isCollectionDestinationPage({
      ...page,
      items: [{ ...makeCollectionSummary(), assigned: 1 }],
    }),
    false,
  )
  assert.equal(
    isCollectionMembershipResult({ assigned: true, changed: false }),
    true,
  )
  assert.equal(
    isCollectionMembershipResult({ assigned: false, changed: true }),
    true,
  )
  assert.equal(isCollectionMembershipResult({ assigned: true }), false)
  assert.equal(
    isCollectionMembershipResult({ assigned: 'true', changed: false }),
    false,
  )
})

test('Collection IPC validates identities and bounded pagination without filesystem paths', () => {
  const { id } = makeCollectionSummary()
  assert.deepEqual(requireCollectionGetRequest({ id }), { id })
  for (const value of [null, {}, { id: '../library' }, { id: 'Picks' }]) {
    assert.throws(() => requireCollectionGetRequest(value), {
      code: 'INVALID_INPUT',
    })
  }
  assert.deepEqual(requireCollectionPage({}), { limit: 50, offset: 0 })
  for (const value of [{ limit: 101 }, { offset: -1 }, { limit: 0 }, null]) {
    assert.throws(() => requireCollectionPage(value), { code: 'INVALID_INPUT' })
  }
})

test('Collection IPC responses require canonical saved data, counts and consistent unique bounded pages', () => {
  const collection = makeCollectionSummary()
  assert.equal(isCollection(collection), true)
  assert.equal(isCollectionSummary(collection), true)
  for (const value of [
    { ...collection, name: ' Picks ' },
    { ...collection, description: '' },
    { ...collection, coverAssetId: '../cover.png' },
    { ...collection, sampleCount: -1 },
    { ...collection, sampleCount: 0.5 },
  ]) {
    assert.equal(isCollectionSummary(value), false)
  }
  const page = { items: [collection], total: 1, limit: 50, offset: 0 }
  assert.equal(isCollectionPage(page), true)
  for (const value of [
    { ...page, total: 0 },
    { ...page, limit: 101 },
    { ...page, offset: 1 },
    { ...page, items: [{ ...collection, sampleCount: undefined }] },
    { ...page, total: 2, items: [collection, collection] },
  ]) {
    assert.equal(isCollectionPage(value), false)
  }
})
