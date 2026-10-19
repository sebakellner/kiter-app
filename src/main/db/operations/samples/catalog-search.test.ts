import assert from 'node:assert/strict'
import { test } from 'node:test'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { createMemoryDatabase } from '../../../../../tests/support/database/connection.ts'
import { makeDiscoveredAudioFile } from '../../../../../tests/support/fixtures/source.ts'
import { importFolder } from '../sources/import.ts'
import { listCatalogSamples } from './catalog.ts'
import { updateSample } from './operations.ts'
import { setFavorite } from './favorites.ts'
import {
  createCategory,
  setCategoryAssignment,
} from '../classification/operations.ts'
import { listGenres, setGenreAssignment } from '../classification/genres.ts'
import {
  readSampleType,
  saveSampleType,
} from '../classification/sample-type.ts'
import { sampleSources } from '../../schema/samples.ts'

test('catalog search matches all literal words across names and relative paths, ignores case/accents and never searches parent directories', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('private-parent-search', 'catalog-search')
  const files = [
    'Percusión/Kíck_808.wav',
    'Café/Clap.wav',
    '100%_dry.wav',
    '100ab_dry.wav',
    "producer's.wav",
  ].map((name) => makeDiscoveredAudioFile(root, name))
  const imported = importFolder(db, root, files)
  const kick = imported.find(({ name }) => name === 'Kíck_808.wav')!
  updateSample(db, {
    id: kick.id,
    displayName: 'Warm Hit',
    notes: 'Do not search these notes',
  })
  const names = (search: string): string[] =>
    listCatalogSamples(db, { search }).items.map(({ name }) => name)
  assert.deepEqual(names('PERCUSION warm'), ['Warm Hit'])
  assert.deepEqual(names('ki\u0301ck 808'), ['Warm Hit'])
  assert.deepEqual(names('cafe CLAP'), ['Clap.wav'])
  assert.deepEqual(names('Percusión\\Kíck'), ['Warm Hit'])
  assert.deepEqual(names('100%_'), ['100%_dry.wav'])
  assert.deepEqual(names("producer's"), ["producer's.wav"])
  assert.deepEqual(names("' OR 1=1 --"), [])
  assert.deepEqual(names('private-parent-search'), [])
  assert.deepEqual(names('these notes'), [])
  assert.deepEqual(names('warm missing'), [])
  assert.equal(listCatalogSamples(db, { search: ' ' }).total, 5)
  assert.equal(listCatalogSamples(db, { search: 'x' }).total, 5)
  db.update(sampleSources)
    .set({ availability: 'missing', lastErrorCode: 'ENOENT' })
    .where(eq(sampleSources.sampleId, kick.id))
    .run()
  assert.deepEqual(names('warm'), ['Warm Hit'])
  // Overlapping roots must neither duplicate nor widen the displayed path search.
  importFolder(db, path.join(root, 'Percusión'), [files[0]])
  assert.equal(listCatalogSamples(db, { search: 'warm' }).total, 1)
  assert.deepEqual(
    listCatalogSamples(db, { search: 'warm' }).items[0].relativePath,
    path.join('Percusión', 'Kíck_808.wav'),
  )
})

test('catalog search ranks exact names, prefixes, substrings and path matches before pagination', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('ranked-search')
  const imported = importFolder(
    db,
    root,
    ['kick.wav', 'kick-bright.wav', 'a-kick.wav', 'kick/z-other.wav'].map(
      (name) => makeDiscoveredAudioFile(root, name),
    ),
  )
  const exact = imported.find(({ name }) => name === 'kick.wav')!
  updateSample(db, { id: exact.id, displayName: 'Kíck' })
  const first = listCatalogSamples(db, { search: 'kick', limit: 2 })
  assert.equal(first.total, 4)
  assert.deepEqual(
    first.items.map(({ name }) => name),
    ['Kíck', 'kick-bright.wav'],
  )
  assert.deepEqual(
    listCatalogSamples(db, { search: 'kick', offset: 2, limit: 2 }).items.map(
      ({ name }) => name,
    ),
    ['a-kick.wav', 'z-other.wav'],
  )
  assert.deepEqual(listCatalogSamples(db, { search: 'kick', limit: 2 }), first)
})

test('catalog search intersects Categories, Genres, types and Favorites before counting and paging', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('combined-search')
  const imported = importFolder(
    db,
    root,
    ['a-kick.wav', 'b-kick.wav', 'c-kick.wav', 'd-snare.wav'].map((name) =>
      makeDiscoveredAudioFile(root, name),
    ),
  )
  const category = createCategory(db, { name: 'Drums' })
  const genre = listGenres(db, { search: 'house' }).items.find(
    ({ name }) => name === 'House',
  )!
  for (const sample of imported) {
    setCategoryAssignment(db, {
      id: category.id,
      target: { kind: 'sample', id: sample.id },
      assigned: true,
    })
    setGenreAssignment(db, {
      id: genre.id,
      target: { kind: 'sample', id: sample.id },
      assigned: true,
    })
    saveSampleType(db, {
      ...readSampleType(db, { sampleId: sample.id }),
      sampleType: 'loop',
    })
    if (sample.name !== 'a-kick.wav') {
      setFavorite(db, sample.id, true)
    }
  }
  const filters = {
    search: 'kick',
    categoryIds: [category.id],
    genreIds: [genre.id],
    sampleTypes: ['loop'] as const,
    favoritesOnly: true,
  }
  const request = {
    ...filters,
    sampleTypes: [...filters.sampleTypes],
    limit: 1,
  }
  const first = listCatalogSamples(db, request)
  assert.equal(first.total, 2)
  assert.deepEqual(
    first.items.map(({ name }) => name),
    ['b-kick.wav'],
  )
  assert.deepEqual(
    listCatalogSamples(db, { ...request, offset: 1 }).items.map(
      ({ name }) => name,
    ),
    ['c-kick.wav'],
  )
  assert.equal(
    listCatalogSamples(db, { ...request, sampleTypes: ['unknown'] }).total,
    0,
  )
})
