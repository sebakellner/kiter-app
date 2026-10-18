import assert from 'node:assert/strict'
import { test } from 'node:test'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import {
  createDiskDatabase,
  createMemoryDatabase,
} from '../../../../../tests/support/database/connection.ts'
import { makeDiscoveredAudioFile } from '../../../../../tests/support/fixtures/source.ts'
import { importFolder } from '../sources/import.ts'
import { samples } from '../../schema/samples.ts'
import { sampleGenres } from '../../schema/recognition.ts'
import { prepareSampleClassification } from './preparation.ts'
import { applySampleClassification } from './apply.ts'
import { initializeRecognitionVocabulary } from './vocabulary.ts'
import {
  recognitionVocabulary,
  recognitionAliases,
} from '../../schema/recognition.ts'

test('explicit application atomically persists Categories, Genres and type while preserving Sample identity', async (t) => {
  const disk = await createDiskDatabase(t)
  let db = disk.connection.db
  const root = path.resolve('House')
  const [sample] = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'kick_loop.wav'),
  ])
  const preparation = prepareSampleClassification(db, { sampleId: sample.id })
  applySampleClassification(db, {
    sampleId: sample.id,
    token: preparation.token,
    keys: ['category:kick', 'genre:house', 'loop'],
  })
  db = disk.reopen().db
  const saved = prepareSampleClassification(db, { sampleId: sample.id })
  assert.deepEqual(
    saved.items
      .filter((item) => item.kind === 'assigned')
      .map((item) => item.key)
      .sort(),
    ['category:kick', 'genre:house', 'loop'],
  )
  assert.equal(
    db.select().from(samples).where(eq(samples.id, sample.id)).get()
      ?.sampleType,
    'loop',
  )
  importFolder(db, root, [makeDiscoveredAudioFile(root, 'kick_loop.wav')])
  assert.equal(
    db.select().from(samples).where(eq(samples.id, sample.id)).get()
      ?.sampleType,
    'loop',
  )
})

test('invalid or stale suggestions perform no partial writes and late transaction failures roll back vocabulary creation', (t) => {
  const { db, native } = createMemoryDatabase(t)
  const root = path.resolve('House')
  const [sample] = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'kick_loop.wav'),
  ])
  const preparation = prepareSampleClassification(db, { sampleId: sample.id })
  assert.throws(
    () =>
      applySampleClassification(db, {
        sampleId: sample.id,
        token: preparation.token,
        keys: ['category:kick', 'invented'],
      }),
    { code: 'STALE_REVIEW' },
  )
  assert.equal(db.query.categories.findFirst().sync(), undefined)
  native.exec(
    "CREATE TRIGGER fail_genre BEFORE INSERT ON sample_genres BEGIN SELECT RAISE(ABORT, 'injected'); END",
  )
  assert.throws(() =>
    applySampleClassification(db, {
      sampleId: sample.id,
      token: preparation.token,
      keys: ['category:kick', 'genre:house'],
    }),
  )
  assert.equal(db.query.categories.findFirst().sync(), undefined)
  assert.deepEqual(db.select().from(sampleGenres).all(), [])
  db.update(samples)
    .set({ favorite: true })
    .where(eq(samples.id, sample.id))
    .run()
  assert.throws(
    () =>
      applySampleClassification(db, {
        sampleId: sample.id,
        token: preparation.token,
        keys: ['category:kick'],
      }),
    { code: 'STALE_REVIEW' },
  )
})

test('existing libraries recognize and save Drums, Drum Breaks and explicit Loop independently', async (t) => {
  const disk = await createDiskDatabase(t)
  let db = disk.connection.db
  db.delete(recognitionVocabulary)
    .where(eq(recognitionVocabulary.key, 'category:drum-breaks'))
    .run()
  // Existing libraries can lack the newer singular Drum alias.
  db.delete(recognitionAliases)
    .where(eq(recognitionAliases.suppliedKey, 'category:drums:drum'))
    .run()
  initializeRecognitionVocabulary(db, false)
  assert.equal(db.query.categories.findFirst().sync(), undefined)
  const root = path.resolve('Vintage Drum Breaks')
  const [sample] = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'Loops/100_001_Mic1.wav'),
  ])
  const preparation = prepareSampleClassification(db, { sampleId: sample.id })
  assert.deepEqual(
    [...new Set(preparation.items.map((item) => item.key))].sort(),
    ['category:drum-breaks', 'category:drums', 'loop'],
  )
  applySampleClassification(db, {
    sampleId: sample.id,
    token: preparation.token,
    keys: ['category:drums', 'category:drum-breaks', 'loop'],
  })
  db = disk.reopen().db
  assert.deepEqual(
    prepareSampleClassification(db, { sampleId: sample.id })
      .items.filter((item) => item.kind === 'assigned')
      .map((item) => item.name)
      .sort(),
    ['Drum Breaks', 'Drums', 'Loop'],
  )
})
