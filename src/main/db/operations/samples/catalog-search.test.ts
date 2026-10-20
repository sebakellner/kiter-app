import assert from 'node:assert/strict'
import { test } from 'node:test'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { createMemoryDatabase } from '../../../../../tests/support/database/connection.ts'
import { makeDiscoveredAudioFile } from '../../../../../tests/support/fixtures/source.ts'
import { importFolder } from '../sources/import.ts'
import { getCatalogSample, listCatalogSamples } from './catalog.ts'
import { updateSample } from './operations.ts'
import { setFavorite } from './favorites.ts'
import {
  createInstrument,
  renameInstrument,
  setInstrumentAssignment,
} from '../classification/operations.ts'
import {
  createGenre,
  listGenres,
  renameGenre,
  setGenreAssignment,
} from '../classification/genres.ts'
import { writeRecognitionAlias } from '../classification/vocabulary.ts'
import { prepareSampleClassification } from '../classification/preparation.ts'
import {
  getPackSourceRoot,
  importPack,
  reviewPackImport,
} from '../packs/operations.ts'
import {
  readSampleType,
  saveSampleType,
} from '../classification/sample-type.ts'
import { sampleSources } from '../../schema/samples.ts'
import { sourceRoots } from '../../schema/sources.ts'

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
  assert.deepEqual(names(' \t PERCUSION  \n warm \r '), ['Warm Hit'])
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

test('catalog search ranks complete multiword phrases before split-word matches', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('multiword-rank')
  const imported = importFolder(
    db,
    root,
    ['a.wav', 'b.wav', 'c.wav', 'd.wav', 'e.wav'].map((name) =>
      makeDiscoveredAudioFile(root, name),
    ),
  )
  const names = [
    'Kick House',
    'Kick House Bright',
    'A Kick House',
    'House Kick',
    'Z Hit',
  ]
  const instrument = createInstrument(db, { name: 'Kick' })
  const genre = listGenres(db, { search: 'House' }).items.find(
    ({ name }) => name === 'House',
  )!
  imported.forEach((sample, index) => {
    updateSample(db, { id: sample.id, displayName: names[index] })
    const target = { kind: 'sample', id: sample.id } as const
    setInstrumentAssignment(db, { id: instrument.id, target, assigned: true })
    setGenreAssignment(db, { id: genre.id, target, assigned: true })
  })
  const first = listCatalogSamples(db, {
    search: '  kick \t house  ',
    limit: 3,
  })
  assert.equal(first.total, 5)
  assert.deepEqual(
    first.items.map(({ name }) => name),
    names.slice(0, 3),
  )
  assert.deepEqual(
    listCatalogSamples(db, {
      search: 'kick house',
      limit: 3,
      offset: 3,
    }).items.map(({ name }) => name),
    names.slice(3),
  )
})

test('catalog search uses exactly the displayed relative path in pages and individual reads, with or without registered roots', (t) => {
  const { db, native } = createMemoryDatabase(t)
  const root = path.resolve('relative-path-parity')
  const file = makeDiscoveredAudioFile(root, 'Café Textures/Ópen Hat.wav')
  const [sample] = importFolder(db, root, [file])
  importFolder(db, path.join(root, 'Café Textures'), [file])
  for (const registered of [true, false]) {
    db.update(sourceRoots).set({ registered }).run()
    const row = getCatalogSample(db, sample.id)
    const expected = registered
      ? path.relative(root, row.path)
      : path.basename(row.path)
    assert.equal(row.relativePath, expected)
    assert.deepEqual(
      native
        .prepare('select kiter_relative_path(?, ?) as relativePath')
        .get(row.path, row.rootPath),
      { relativePath: expected },
    )
    const page = listCatalogSamples(db, { search: row.relativePath })
    assert.equal(page.total, 1)
    assert.deepEqual(page.items, [
      {
        ...row,
        classification: {
          instruments: [],
          genres: [],
          sampleType: null,
          additionalInstrumentCount: 0,
          additionalGenreCount: 0,
        },
      },
    ])
    assert.equal(
      listCatalogSamples(db, { search: 'cafe textures' }).total,
      registered ? 1 : 0,
    )
  }
})

test('catalog search ranks exact names, prefixes, substrings and path matches before pagination', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('ranked-search')
  const imported = importFolder(
    db,
    root,
    [
      'kick.wav',
      'kick-bright.wav',
      'a-kick.wav',
      'kick/z-other.wav',
      'b-hit.wav',
    ].map((name) => makeDiscoveredAudioFile(root, name)),
  )
  const exact = imported.find(({ name }) => name === 'kick.wav')!
  updateSample(db, { id: exact.id, displayName: 'Kíck' })
  const instrument = createInstrument(db, { name: 'Kick' })
  setInstrumentAssignment(db, {
    id: instrument.id,
    target: {
      kind: 'sample',
      id: imported.find(({ name }) => name === 'b-hit.wav')!.id,
    },
    assigned: true,
  })
  const first = listCatalogSamples(db, { search: 'kick', limit: 2 })
  assert.equal(first.total, 5)
  assert.deepEqual(
    first.items.map(({ name }) => name),
    ['Kíck', 'kick-bright.wav'],
  )
  assert.deepEqual(
    listCatalogSamples(db, { search: 'kick', offset: 2, limit: 2 }).items.map(
      ({ name }) => name,
    ),
    ['a-kick.wav', 'b-hit.wav'],
  )
  assert.deepEqual(
    listCatalogSamples(db, { search: 'kick', offset: 4, limit: 2 }).items.map(
      ({ name }) => name,
    ),
    ['z-other.wav'],
  )
  assert.deepEqual(listCatalogSamples(db, { search: 'kick', limit: 2 }), first)
})

test('catalog search intersects Instruments, Genres, types and Favorites before counting and paging', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('combined-search')
  const imported = importFolder(
    db,
    root,
    ['a-kick.wav', 'b-kick.wav', 'c-kick.wav', 'd-snare.wav'].map((name) =>
      makeDiscoveredAudioFile(root, name),
    ),
  )
  const instrument = createInstrument(db, { name: 'Drums' })
  const genre = listGenres(db, { search: 'house' }).items.find(
    ({ name }) => name === 'House',
  )!
  for (const sample of imported) {
    setInstrumentAssignment(db, {
      id: instrument.id,
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
    search: 'kick drums house',
    instrumentIds: [instrument.id],
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

test('catalog search matches literal accent-insensitive words across direct Instruments, Genres and source fields without duplicate Samples', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('classification-search')
  const [sample, other] = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'Textures/hit.wav'),
    makeDiscoveredAudioFile(root, 'other.wav'),
  ])
  const percussion = createInstrument(db, { name: 'Percusión %_' })
  const drums = createInstrument(db, { name: 'Warm Drums' })
  const genre = createGenre(db, { name: 'Café Style' })
  const secondGenre = createGenre(db, { name: 'Café Rhythm' })
  for (const instrument of [percussion, drums]) {
    setInstrumentAssignment(db, {
      id: instrument.id,
      target: { kind: 'sample', id: sample.id },
      assigned: true,
    })
  }
  for (const assignedGenre of [genre, secondGenre]) {
    setGenreAssignment(db, {
      id: assignedGenre.id,
      target: { kind: 'sample', id: sample.id },
      assigned: true,
    })
  }
  for (const search of [
    'PERCUSION',
    'cafe',
    'percu\u0301sion CAFE textures hit',
    'warm percusion style rhythm',
    '%_',
  ]) {
    const page = listCatalogSamples(db, { search, limit: 1 })
    assert.equal(page.total, 1)
    assert.deepEqual(
      page.items.map(({ id }) => id),
      [sample.id],
    )
    assert.equal(
      listCatalogSamples(db, { search, offset: 1, limit: 1 }).items.length,
      0,
    )
  }
  for (const search of ['percusion missing', 'percusoin', "' OR 1=1 --"]) {
    assert.equal(listCatalogSamples(db, { search }).total, 0)
  }
  // Words cannot be satisfied by assignments belonging to different Samples.
  setGenreAssignment(db, {
    id: genre.id,
    target: { kind: 'sample', id: other.id },
    assigned: true,
  })
  assert.equal(listCatalogSamples(db, { search: 'other percusion' }).total, 0)
  db.update(sampleSources)
    .set({ availability: 'missing', lastErrorCode: 'ENOENT' })
    .where(eq(sampleSources.sampleId, sample.id))
    .run()
  assert.deepEqual(
    listCatalogSamples(db, { search: 'percusion cafe' }).items.map(
      ({ id }) => id,
    ),
    [sample.id],
  )
})

test('catalog search reflects saved classification renames and removals on the next query', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('classification-search-updates')
  const [sample] = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'hit.wav'),
  ])
  const instrument = createInstrument(db, { name: 'Wooden Hits' })
  const genre = createGenre(db, { name: 'Quiet Style' })
  const target = { kind: 'sample', id: sample.id } as const
  setInstrumentAssignment(db, { id: instrument.id, target, assigned: true })
  setGenreAssignment(db, { id: genre.id, target, assigned: true })
  assert.equal(listCatalogSamples(db, { search: 'wooden quiet' }).total, 1)
  renameInstrument(db, { id: instrument.id, name: 'Metallic Hits' })
  renameGenre(db, { id: genre.id, name: 'Loud Style' })
  assert.equal(listCatalogSamples(db, { search: 'wooden' }).total, 0)
  assert.equal(listCatalogSamples(db, { search: 'quiet' }).total, 0)
  assert.equal(listCatalogSamples(db, { search: 'metallic loud' }).total, 1)
  setInstrumentAssignment(db, { id: instrument.id, target, assigned: false })
  setGenreAssignment(db, { id: genre.id, target, assigned: false })
  assert.equal(listCatalogSamples(db, { search: 'metallic' }).total, 0)
  assert.equal(listCatalogSamples(db, { search: 'loud' }).total, 0)
})

test('catalog search excludes recognition aliases, pending suggestions and origin Pack classifications', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('classification-search-scope', 'House')
  const [sample] = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'hit.wav'),
  ])
  assert.ok(
    prepareSampleClassification(db, { sampleId: sample.id }).items.some(
      ({ name }) => name === 'House',
    ),
  )
  assert.equal(listCatalogSamples(db, { search: 'house' }).total, 0)
  const instrument = createInstrument(db, { name: 'Wooden Hits' })
  writeRecognitionAlias(db, {
    targetKey: `instrument:${instrument.id}`,
    term: 'Timber',
  })
  setInstrumentAssignment(db, {
    id: instrument.id,
    target: { kind: 'sample', id: sample.id },
    assigned: true,
  })
  assert.equal(listCatalogSamples(db, { search: 'wooden' }).total, 1)
  assert.equal(listCatalogSamples(db, { search: 'timber' }).total, 0)
  const sourceRootId = getPackSourceRoot(db, root).id
  const review = reviewPackImport(db, sourceRootId)
  const pack = importPack(db, {
    sourceRootId,
    token: review.token,
    name: 'Hidden Package',
    decisions: [],
  })
  const packInstrument = createInstrument(db, { name: 'Metallic Hits' })
  const packGenre = createGenre(db, { name: 'Quiet Style' })
  setInstrumentAssignment(db, {
    id: packInstrument.id,
    target: { kind: 'pack', id: pack.id },
    assigned: true,
  })
  setGenreAssignment(db, {
    id: packGenre.id,
    target: { kind: 'pack', id: pack.id },
    assigned: true,
  })
  for (const search of ['metallic', 'quiet', 'hidden package', 'house']) {
    assert.equal(listCatalogSamples(db, { search }).total, 0)
  }
})
