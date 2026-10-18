import assert from 'node:assert/strict'
import { test } from 'node:test'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { createMemoryDatabase } from '../../../../../tests/support/database/connection.ts'
import { makeDiscoveredAudioFile } from '../../../../../tests/support/fixtures/source.ts'
import { importFolder } from '../sources/import.ts'
import { createCategory } from './operations.ts'
import { writeRecognitionAlias } from './vocabulary.ts'
import { prepareSampleClassification } from './preparation.ts'
import {
  samples,
  sampleSources,
  sourceRoots,
  recognitionAliases,
} from '../../schema/index.ts'
import { randomUUID } from 'node:crypto'

test('preparation uses only eligible cataloged paths, deduplicates roots and never writes classifications', (t) => {
  const { db, native } = createMemoryDatabase(t)
  const root = path.resolve('Techno', 'House')
  const file = makeDiscoveredAudioFile(root, 'Drums/Kicks/kick_loop.wav')
  const [sample] = importFolder(db, root, [file])
  importFolder(db, path.join(root, 'Drums'), [file])
  db.update(samples)
    .set({ displayName: 'Jazz Snare' })
    .where(eq(samples.id, sample.id))
    .run()
  db.update(sampleSources)
    .set({ availability: 'missing', lastErrorCode: 'ENOENT' })
    .where(eq(sampleSources.sampleId, sample.id))
    .run()
  const before = native.prepare('SELECT total_changes() AS total').get()
  const first = prepareSampleClassification(db, {
    sampleId: sample.id,
    limit: 2,
  })
  assert.equal(first.sampleName, 'Jazz Snare')
  assert.equal(first.proposalCount, 4)
  assert.equal(first.items.length, 2)
  const items = [...first.items]
  for (let offset = 2; offset < first.total; offset += 2) {
    items.push(
      ...prepareSampleClassification(db, {
        sampleId: sample.id,
        limit: 2,
        offset,
        token: first.token,
      }).items,
    )
  }
  assert.deepEqual([...new Set(items.map((item) => item.name))].sort(), [
    'Drums',
    'House',
    'Kick',
    'Loop',
  ])
  assert.equal(items.filter((item) => item.name === 'Drums').length, 1)
  assert.ok(
    items.every((item) => item.evidence.startsWith('Cataloged location:')),
  )
  assert.equal(items.find((item) => item.name === 'Kick')?.needsCreation, true)
  assert.deepEqual(
    native.prepare('SELECT total_changes() AS total').get(),
    before,
  )
})

test('preparation pages reject stale evidence and reflect existing assignments without renaming source clues', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('House')
  const [sample] = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'kick.wav'),
  ])
  const first = prepareSampleClassification(db, {
    sampleId: sample.id,
    limit: 1,
  })
  createCategory(db, { name: 'Kick' })
  assert.throws(
    () =>
      prepareSampleClassification(db, {
        sampleId: sample.id,
        limit: 1,
        offset: 1,
        token: first.token,
      }),
    { code: 'STALE_REVIEW' },
  )
  const fresh = prepareSampleClassification(db, { sampleId: sample.id })
  assert.equal(
    fresh.items.find((item) => item.name === 'Kick')?.needsCreation,
    false,
  )
  writeRecognitionAlias(db, { targetKey: 'category:kick', term: 'Punch' })
  assert.throws(
    () =>
      prepareSampleClassification(db, {
        sampleId: sample.id,
        token: fresh.token,
      }),
    { code: 'STALE_REVIEW' },
  )
  assert.throws(
    () => prepareSampleClassification(db, { sampleId: randomUUID() }),
    { code: 'NOT_FOUND' },
  )
  db.update(sourceRoots).set({ registered: false }).run()
  assert.equal(
    prepareSampleClassification(db, { sampleId: sample.id }).total,
    0,
  )
})

test('VintageDrums is recognized with existing vocabulary and Drum adds folder evidence explicitly', (t) => {
  const { db } = createMemoryDatabase(t)
  // Model a previously initialized vocabulary that predates the Drum alias.
  db.delete(recognitionAliases)
    .where(eq(recognitionAliases.suppliedKey, 'category:drums:drum'))
    .run()
  const root = path.resolve('Touch.Loops.Vintage.Drum.Breaks')
  const [sample] = importFolder(db, root, [
    makeDiscoveredAudioFile(
      root,
      'Touch_Loops_Vintage_Drum_Breaks_SAMPLE_PACK/_(WAVs)_Loops/_(WAVs)_(100BPM)/100_VintageDrums_05_TL.wav',
    ),
  ])
  const before = prepareSampleClassification(db, { sampleId: sample.id })
  assert.equal(before.proposalCount, 3)
  assert.deepEqual(
    [...new Set(before.items.map((item) => item.name))],
    ['Drum Breaks', 'Drums', 'Loop'],
  )
  writeRecognitionAlias(db, { targetKey: 'category:drums', term: 'Drum' })
  const after = prepareSampleClassification(db, { sampleId: sample.id })
  assert.equal(after.proposalCount, 3)
  assert.equal(after.ambiguityCount, 0)
  const drums = after.items.filter((item) => item.key === 'category:drums')
  assert.equal(drums.length, 3)
  assert.ok(
    drums
      .filter((item) => item.clue === 'drum breaks')
      .every(
        (item) =>
          item.clue === 'drum breaks' &&
          item.rule === 'alias' &&
          item.needsCreation,
      ),
  )
  assert.equal(drums.filter((item) => item.clue === 'drum breaks').length, 2)
  assert.ok(drums.some((item) => item.clue === 'drums' && item.rule === 'name'))
  assert.throws(
    () =>
      prepareSampleClassification(db, {
        sampleId: sample.id,
        token: before.token,
      }),
    { code: 'STALE_REVIEW' },
  )
})
