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
import { samples, sampleSources } from '../../schema/samples.ts'
import { readSampleType, saveSampleType } from './sample-type.ts'

test('type replacement survives reopen/rescan and Unknown persists as null without changing Sample data', async (t) => {
  const disk = await createDiskDatabase(t)
  let db = disk.connection.db
  const root = path.resolve('type-editor')
  const files = [makeDiscoveredAudioFile(root, 'loop.wav')]
  const [sample] = importFolder(db, root, files)
  db.update(samples)
    .set({ favorite: true, notes: 'Preserve', sampleType: 'loop' })
    .where(eq(samples.id, sample.id))
    .run()
  const before = db.select().from(samples).get()!
  const sources = db.select().from(sampleSources).all()
  saveSampleType(db, {
    sampleId: sample.id,
    token: readSampleType(db, { sampleId: sample.id }).token,
    sampleType: 'one-shot',
  })
  db = disk.reopen().db
  assert.deepEqual(db.select().from(samples).get(), {
    ...before,
    sampleType: 'one-shot',
  })
  assert.deepEqual(db.select().from(sampleSources).all(), sources)
  importFolder(db, root, files)
  assert.equal(
    readSampleType(db, { sampleId: sample.id }).sampleType,
    'one-shot',
  )
  saveSampleType(db, {
    sampleId: sample.id,
    token: readSampleType(db, { sampleId: sample.id }).token,
    sampleType: 'unknown',
  })
  db = disk.reopen().db
  assert.equal(db.select().from(samples).get()?.sampleType, null)
  assert.equal(
    readSampleType(db, { sampleId: sample.id }).sampleType,
    'unknown',
  )
})

test('stale, invalid and late-failing type writes preserve the saved value', (t) => {
  const { db, native } = createMemoryDatabase(t)
  const root = path.resolve('type-editor')
  const [sample] = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'loop.wav'),
  ])
  const original = readSampleType(db, { sampleId: sample.id })
  saveSampleType(db, {
    sampleId: sample.id,
    token: original.token,
    sampleType: 'loop',
  })
  assert.throws(
    () =>
      saveSampleType(db, {
        sampleId: sample.id,
        token: original.token,
        sampleType: 'one-shot',
      }),
    { code: 'STALE_REVIEW' },
  )
  const current = readSampleType(db, { sampleId: sample.id })
  native.exec(
    "CREATE TRIGGER fail_type BEFORE UPDATE OF sample_type ON samples BEGIN SELECT RAISE(ABORT, 'injected'); END",
  )
  assert.throws(() =>
    saveSampleType(db, {
      sampleId: sample.id,
      token: current.token,
      sampleType: 'unknown',
    }),
  )
  assert.equal(db.select().from(samples).get()?.sampleType, 'loop')
})
