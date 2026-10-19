import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { test } from 'node:test'
import { createMemoryDatabase } from '../../../../../tests/support/database/connection.ts'
import { makeDiscoveredAudioFile } from '../../../../../tests/support/fixtures/source.ts'
import { importFolder } from '../sources/import.ts'
import { getSample, updateSample } from '../samples/operations.ts'
import { setFavorite } from '../samples/favorites.ts'
import { listCatalogSamples } from '../samples/catalog.ts'
import {
  createCollection,
  getCollectionSummary,
  listCollectionSamples,
  listCollectionDestinations,
  setCollectionMembership,
} from './operations.ts'

test('Collection membership reports actual changes, preserves order and removes only references', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('collection-membership')
  const [first, second, other] = importFolder(
    db,
    root,
    ['z.wav', 'a.wav', 'other.wav'].map((name) =>
      makeDiscoveredAudioFile(root, name),
    ),
  )
  setFavorite(db, first.id, true)
  updateSample(db, {
    id: first.id,
    displayName: 'Saved name',
    notes: 'Preserve notes',
  })
  const before = getSample(db, first.id)
  const collection = createCollection(db, { name: 'Picks' })
  const request = {
    collectionId: collection.id,
    sampleId: first.id,
    assigned: true,
  }
  assert.deepEqual(setCollectionMembership(db, request), {
    assigned: true,
    changed: true,
  })
  setCollectionMembership(db, { ...request, sampleId: second.id })
  const members = listCollectionSamples(db, collection.id)
  assert.deepEqual(setCollectionMembership(db, request), {
    assigned: true,
    changed: false,
  })
  assert.deepEqual(listCollectionSamples(db, collection.id), members)
  const page = listCatalogSamples(db, { collectionId: collection.id, limit: 1 })
  assert.equal(page.total, 2)
  assert.equal(page.items[0].id, first.id)
  assert.equal(
    listCatalogSamples(db, { collectionId: collection.id, limit: 1, offset: 1 })
      .items[0].id,
    second.id,
  )
  assert.equal(
    listCatalogSamples(db, { collectionId: collection.id, favoritesOnly: true })
      .items[0].id,
    first.id,
  )
  assert.equal(
    listCatalogSamples(db, { collectionId: collection.id, search: 'other' })
      .total,
    0,
  )
  assert.deepEqual(
    setCollectionMembership(db, { ...request, assigned: false }),
    { assigned: false, changed: true },
  )
  assert.deepEqual(
    setCollectionMembership(db, { ...request, assigned: false }),
    { assigned: false, changed: false },
  )
  assert.deepEqual(getSample(db, first.id), before)
  assert.equal(getSample(db, other.id).id, other.id)
  assert.equal(getCollectionSummary(db, collection.id).sampleCount, 1)
  assert.equal(listCatalogSamples(db, {}).total, 3)
  assert.equal(
    listCatalogSamples(db, { collectionId: collection.id }).items[0].id,
    second.id,
  )
  assert.throws(() => listCatalogSamples(db, { collectionId: randomUUID() }), {
    code: 'NOT_FOUND',
  })
  assert.throws(
    () => setCollectionMembership(db, { ...request, sampleId: randomUUID() }),
    { code: 'NOT_FOUND' },
  )
  assert.throws(
    () =>
      setCollectionMembership(db, { ...request, collectionId: randomUUID() }),
    { code: 'NOT_FOUND' },
  )
  assert.equal(getCollectionSummary(db, collection.id).sampleCount, 1)
})

test('destination search pages homonyms by stable identity and observes membership without duplicates or wildcard expansion', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('collection-destinations')
  const [sample] = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'kick.wav'),
  ])
  const collections = Array.from({ length: 52 }, () =>
    createCollection(db, { name: 'Téxtures' }),
  )
  const ordered = collections.slice().sort((a, b) => a.id.localeCompare(b.id))
  setCollectionMembership(db, {
    collectionId: ordered[0].id,
    sampleId: sample.id,
    assigned: true,
  })
  const first = listCollectionDestinations(db, {
    sampleId: sample.id,
    search: 'TEXTURES',
    limit: 50,
  })
  assert.equal(first.total, 52)
  assert.equal(first.items.length, 50)
  assert.deepEqual(first.items[0], {
    ...ordered[0],
    sampleCount: 1,
    assigned: true,
  })
  assert.equal(first.items[1].assigned, false)
  assert.deepEqual(
    listCollectionDestinations(db, {
      sampleId: sample.id,
      search: 'textures',
      limit: 50,
      offset: 50,
    }).items.map(({ id }) => id),
    ordered.slice(50).map(({ id }) => id),
  )
  const percent = createCollection(db, { name: '100% picks' })
  createCollection(db, { name: '100ab picks' })
  assert.deepEqual(
    listCollectionDestinations(db, {
      sampleId: sample.id,
      search: '%',
    }).items.map(({ id }) => id),
    [percent.id],
  )
  assert.throws(
    () => listCollectionDestinations(db, { sampleId: randomUUID() }),
    { code: 'NOT_FOUND' },
  )
  assert.throws(
    () => listCollectionDestinations(db, { sampleId: sample.id, limit: 101 }),
    { code: 'INVALID_INPUT' },
  )
})
