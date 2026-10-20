import assert from 'node:assert/strict'
import { test } from 'node:test'
import path from 'node:path'
import { createMemoryDatabase } from '../../../../../tests/support/database/connection.ts'
import { makeDiscoveredAudioFile } from '../../../../../tests/support/fixtures/source.ts'
import { importFolder } from '../sources/import.ts'
import { setFavorite } from './favorites.ts'
import { updateSample } from './operations.ts'
import { listCatalogSamples, getCatalogSample } from './catalog.ts'
import {
  createInstrument,
  setInstrumentAssignment,
} from '../classification/operations.ts'
import {
  listGenres,
  setGenreAssignment,
  removeGenre,
  reviewGenreRemoval,
} from '../classification/genres.ts'
import {
  readSampleType,
  saveSampleType,
} from '../classification/sample-type.ts'
import {
  createCollection,
  setCollectionMembership,
} from '../collections/operations.ts'

test('checked identities resolve in bounded catalog or Collection order independently of checkbox order', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('checked-sample-order')
  const imported = importFolder(
    db,
    root,
    ['z.wav', 'a.wav', 'b.wav', 'unselected.wav'].map((name) =>
      makeDiscoveredAudioFile(root, name),
    ),
  )
  const byName = (name: string): string =>
    imported.find((item) => item.name === name)!.id
  const ids = [byName('z.wav'), byName('b.wav'), byName('a.wav')]
  const collection = createCollection(db, { name: 'Source order' })
  for (const sampleId of ids) {
    setCollectionMembership(db, {
      collectionId: collection.id,
      sampleId,
      assigned: true,
    })
  }
  const page = listCatalogSamples(db, { sampleIds: ids, limit: 2 })
  assert.equal(page.total, 3)
  assert.deepEqual(
    page.items.map(({ name }) => name),
    ['a.wav', 'b.wav'],
  )
  assert.deepEqual(
    listCatalogSamples(db, { sampleIds: ids, limit: 2, offset: 2 }).items.map(
      ({ name }) => name,
    ),
    ['z.wav'],
  )
  const members = listCatalogSamples(db, {
    sampleIds: ids.slice().reverse(),
    collectionId: collection.id,
  })
  assert.deepEqual(
    members.items.map(({ id }) => id),
    ids,
  )
  assert.equal(
    listCatalogSamples(db, {
      sampleIds: ['00000000-0000-4000-8000-000000000001'],
    }).total,
    0,
  )
})

test('catalog pages include all roots once, honor presentation names and filter Favorites', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('catalog-fixture')
  const nested = path.join(root, 'nested')
  const files = ['zebra.wav', 'alpha.wav', 'nested/kick.wav'].map((name) =>
    makeDiscoveredAudioFile(root, name),
  )
  const imported = importFolder(db, root, files)
  importFolder(db, nested, [files[2]])
  const kick = imported.find((item) => item.path === files[2].path)!
  setFavorite(db, kick.id, true)
  updateSample(db, { id: kick.id, displayName: 'A custom name' })
  const first = listCatalogSamples(db, { limit: 2 })
  assert.equal(first.total, 3)
  assert.deepEqual(
    first.items.map((item) => item.name),
    ['A custom name', 'alpha.wav'],
  )
  assert.equal(
    listCatalogSamples(db, { limit: 2, offset: 2 }).items[0].name,
    'zebra.wav',
  )
  assert.deepEqual(
    listCatalogSamples(db, { favoritesOnly: true }).items.map(
      (item) => item.id,
    ),
    [kick.id],
  )
  assert.equal(getCatalogSample(db, kick.id).path, files[2].path)
  assert.throws(() => listCatalogSamples(db, { limit: 101 }))
})

test('catalog rows include bounded direct classification labels and a full overflow count', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('row-classification')
  const imported = importFolder(
    db,
    root,
    ['a.wav', 'b.wav'].map((name) => makeDiscoveredAudioFile(root, name)),
  )
  const sample = imported.find(({ name }) => name === 'a.wav')!
  saveSampleType(db, {
    ...readSampleType(db, { sampleId: sample.id }),
    sampleType: 'loop',
  })
  for (const name of ['Piano', 'Keys', 'Synth', 'Strings']) {
    const instrument = createInstrument(db, { name })
    setInstrumentAssignment(db, {
      id: instrument.id,
      target: { kind: 'sample', id: sample.id },
      assigned: true,
    })
  }
  const selectedGenres = listGenres(db, {}).items.slice(0, 3)
  for (const genre of selectedGenres) {
    setGenreAssignment(db, {
      id: genre.id,
      target: { kind: 'sample', id: sample.id },
      assigned: true,
    })
  }
  const first = listCatalogSamples(db, { limit: 1 })
  assert.equal(first.items.length, 1)
  assert.deepEqual(first.items[0].classification, {
    instruments: ['Keys', 'Piano'],
    genres: selectedGenres
      .map(({ name }) => name)
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .slice(0, 2),
    sampleType: 'loop',
    additionalInstrumentCount: 2,
    additionalGenreCount: 1,
  })
  assert.deepEqual(
    listCatalogSamples(db, { limit: 1, offset: 1 }).items[0].classification,
    {
      instruments: [],
      genres: [],
      sampleType: null,
      additionalInstrumentCount: 0,
      additionalGenreCount: 0,
    },
  )
  assert.deepEqual(listCatalogSamples(db, { offset: 2 }).items, [])
})

test('instrument filters match direct assignments with OR before pagination and combine with Favorites', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('instrument-filter')
  const files = ['a.wav', 'b.wav', 'c.wav', 'd.wav'].map((name) =>
    makeDiscoveredAudioFile(root, name),
  )
  const imported = importFolder(db, root, files)
  const byName = (name: string): string =>
    imported.find((sample) => sample.name === name)!.id
  const kick = createInstrument(db, { name: 'Kick' })
  const snare = createInstrument(db, { name: 'Snare' })
  for (const [name, instrument] of [
    ['b.wav', kick],
    ['c.wav', kick],
    ['c.wav', snare],
    ['d.wav', snare],
  ] as const) {
    setInstrumentAssignment(db, {
      id: instrument.id,
      target: { kind: 'sample', id: byName(name) },
      assigned: true,
    })
  }
  setFavorite(db, byName('c.wav'), true)
  const first = listCatalogSamples(db, {
    instrumentIds: [kick.id, snare.id],
    limit: 2,
  })
  assert.equal(first.total, 3)
  assert.deepEqual(
    first.items.map(({ name }) => name),
    ['b.wav', 'c.wav'],
  )
  assert.deepEqual(
    listCatalogSamples(db, {
      instrumentIds: [kick.id, snare.id],
      limit: 2,
      offset: 2,
    }).items.map(({ name }) => name),
    ['d.wav'],
  )
  assert.deepEqual(
    listCatalogSamples(db, {
      instrumentIds: [kick.id],
      favoritesOnly: true,
    }).items.map(({ name }) => name),
    ['c.wav'],
  )
  assert.equal(
    listCatalogSamples(db, {
      instrumentIds: ['00000000-0000-4000-8000-000000000099'],
    }).total,
    0,
  )
  assert.equal(listCatalogSamples(db, { instrumentIds: [] }).total, 4)
  assert.throws(() =>
    listCatalogSamples(db, { instrumentIds: [kick.id, kick.id] }),
  )
})

test('genre filters use direct assignments with OR, intersect Instruments and Favorites, and count before pagination', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('genre-filter')
  const imported = importFolder(
    db,
    root,
    ['house.wav', 'b.wav', 'c.wav', 'd.wav'].map((name) =>
      makeDiscoveredAudioFile(root, name),
    ),
  )
  const byName = (name: string): string =>
    imported.find((sample) => sample.name === name)!.id
  const house = listGenres(db, { search: 'house' }).items.find(
    ({ name }) => name === 'House',
  )!
  const techno = listGenres(db, { search: 'techno' }).items.find(
    ({ name }) => name === 'Techno',
  )!
  const kick = createInstrument(db, { name: 'Kick' })
  for (const [name, genre] of [
    ['b.wav', house],
    ['c.wav', house],
    ['c.wav', techno],
    ['d.wav', techno],
  ] as const) {
    setGenreAssignment(db, {
      id: genre.id,
      target: { kind: 'sample', id: byName(name) },
      assigned: true,
    })
  }
  for (const name of ['c.wav', 'd.wav']) {
    setInstrumentAssignment(db, {
      id: kick.id,
      target: { kind: 'sample', id: byName(name) },
      assigned: true,
    })
  }
  setFavorite(db, byName('c.wav'), true)
  const genreIds = [house.id, techno.id]
  const first = listCatalogSamples(db, { genreIds, limit: 2 })
  assert.equal(first.total, 3)
  assert.deepEqual(
    first.items.map(({ name }) => name),
    ['b.wav', 'c.wav'],
  )
  assert.deepEqual(
    listCatalogSamples(db, { genreIds, limit: 2, offset: 2 }).items.map(
      ({ name }) => name,
    ),
    ['d.wav'],
  )
  assert.deepEqual(
    listCatalogSamples(db, { genreIds, instrumentIds: [kick.id] }).items.map(
      ({ name }) => name,
    ),
    ['c.wav', 'd.wav'],
  )
  assert.deepEqual(
    listCatalogSamples(db, {
      genreIds,
      instrumentIds: [kick.id],
      favoritesOnly: true,
    }).items.map(({ name }) => name),
    ['c.wav'],
  )
  assert.equal(
    listCatalogSamples(db, {
      genreIds: ['00000000-0000-4000-8000-000000000099'],
    }).total,
    0,
  )
  assert.equal(listCatalogSamples(db, { genreIds: [] }).total, 4)
  assert.throws(() =>
    listCatalogSamples(db, { genreIds: [house.id, house.id] }),
  )
  removeGenre(db, {
    id: house.id,
    token: reviewGenreRemoval(db, house.id).token,
  })
  assert.equal(listCatalogSamples(db, { genreIds: [house.id] }).total, 0)
})

test('Sample type filters use saved values with OR, include NULL as Unknown and intersect all other groups before pagination', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('sample-type-filter')
  const imported = importFolder(
    db,
    root,
    ['a_loop.wav', 'b.wav', 'c.wav', 'd.wav', 'e.wav'].map((name) =>
      makeDiscoveredAudioFile(root, name),
    ),
  )
  const byName = (name: string): string =>
    imported.find((sample) => sample.name === name)!.id
  for (const [name, sampleType] of [
    ['b.wav', 'loop'],
    ['c.wav', 'one-shot'],
    ['d.wav', 'loop'],
    ['e.wav', 'one-shot'],
  ] as const) {
    saveSampleType(db, {
      ...readSampleType(db, { sampleId: byName(name) }),
      sampleType,
    })
  }
  const kick = createInstrument(db, { name: 'Kick' })
  const house = listGenres(db, { search: 'house' }).items.find(
    ({ name }) => name === 'House',
  )!
  for (const name of ['b.wav', 'c.wav', 'd.wav']) {
    setInstrumentAssignment(db, {
      id: kick.id,
      target: { kind: 'sample', id: byName(name) },
      assigned: true,
    })
  }
  for (const name of ['c.wav', 'd.wav', 'e.wav']) {
    setGenreAssignment(db, {
      id: house.id,
      target: { kind: 'sample', id: byName(name) },
      assigned: true,
    })
  }
  setFavorite(db, byName('c.wav'), true)
  const first = listCatalogSamples(db, {
    sampleTypes: ['loop', 'one-shot'],
    limit: 2,
  })
  assert.equal(first.total, 4)
  assert.deepEqual(
    first.items.map(({ name }) => name),
    ['b.wav', 'c.wav'],
  )
  assert.deepEqual(
    listCatalogSamples(db, {
      sampleTypes: ['loop', 'one-shot'],
      limit: 2,
      offset: 2,
    }).items.map(({ name }) => name),
    ['d.wav', 'e.wav'],
  )
  assert.deepEqual(
    listCatalogSamples(db, { sampleTypes: ['loop'] }).items.map(
      ({ name }) => name,
    ),
    ['b.wav', 'd.wav'],
  )
  assert.deepEqual(
    listCatalogSamples(db, { sampleTypes: ['one-shot'] }).items.map(
      ({ name }) => name,
    ),
    ['c.wav', 'e.wav'],
  )
  // A path-based Loop clue does not replace the saved unknown value.
  assert.deepEqual(
    listCatalogSamples(db, { sampleTypes: ['unknown'] }).items.map(
      ({ name }) => name,
    ),
    ['a_loop.wav'],
  )
  assert.equal(
    listCatalogSamples(db, { sampleTypes: ['unknown', 'one-shot'] }).total,
    3,
  )
  assert.equal(
    listCatalogSamples(db, { sampleTypes: ['loop', 'one-shot', 'unknown'] })
      .total,
    5,
  )
  assert.equal(listCatalogSamples(db, { sampleTypes: [] }).total, 5)
  const filters = { instrumentIds: [kick.id], genreIds: [house.id] }
  assert.deepEqual(
    listCatalogSamples(db, { ...filters, sampleTypes: ['loop'] }).items.map(
      ({ name }) => name,
    ),
    ['d.wav'],
  )
  assert.deepEqual(
    listCatalogSamples(db, {
      ...filters,
      sampleTypes: ['one-shot'],
      favoritesOnly: true,
    }).items.map(({ name }) => name),
    ['c.wav'],
  )
  assert.equal(
    listCatalogSamples(db, {
      ...filters,
      sampleTypes: ['loop'],
      favoritesOnly: true,
    }).total,
    0,
  )
  assert.throws(() => listCatalogSamples(db, { sampleTypes: ['loop', 'loop'] }))
})
