import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeCollectionSummary } from '../../../tests/support/fixtures/collection.ts'
import {
  isCollection,
  isCollectionPage,
  isCollectionSummary,
  requireCollectionCreateRequest,
  requireCollectionGetRequest,
} from './collections.ts'
import { requireCollectionPage } from '../domain/collection.ts'

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
