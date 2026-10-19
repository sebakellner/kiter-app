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
import { createInstrument, setInstrumentAssignment } from './operations.ts'
import {
  readSampleInstruments,
  saveSampleInstruments,
} from './sample-instruments.ts'
import { samples, sampleSources } from '../../schema/samples.ts'
import { sampleInstruments } from '../../schema/classification.ts'

test('manual instrument replacement and clearing survive reopening and preserve unrelated Sample state', async (t) => {
  const disk = await createDiskDatabase(t)
  let db = disk.connection.db
  const root = path.resolve('manual-instruments')
  const [sample] = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'kick.wav'),
  ])
  const kick = createInstrument(db, { name: 'Kick' })
  const snare = createInstrument(db, { name: 'Snare' })
  setInstrumentAssignment(db, {
    id: kick.id,
    target: { kind: 'sample', id: sample.id },
    assigned: true,
  })
  db.update(samples)
    .set({ favorite: true, notes: 'Keep me' })
    .where(eq(samples.id, sample.id))
    .run()
  const before = db.select().from(samples).all()
  const sources = db.select().from(sampleSources).all()
  const snapshot = readSampleInstruments(db, { sampleId: sample.id })
  saveSampleInstruments(db, {
    sampleId: sample.id,
    token: snapshot.token,
    instrumentIds: [snare.id],
  })
  db = disk.reopen().db
  const saved = readSampleInstruments(db, { sampleId: sample.id })
  assert.deepEqual(saved.instruments, [snare])
  assert.deepEqual(db.select().from(samples).all(), before)
  assert.deepEqual(db.select().from(sampleSources).all(), sources)
  saveSampleInstruments(db, {
    sampleId: sample.id,
    token: saved.token,
    instrumentIds: [],
  })
  db = disk.reopen().db
  assert.deepEqual(
    readSampleInstruments(db, { sampleId: sample.id }).instruments,
    [],
  )
})

test('stale, missing and failed saves retain every previous instrument assignment', (t) => {
  const { db, native } = createMemoryDatabase(t)
  const root = path.resolve('manual-instruments')
  const [sample] = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'kick.wav'),
  ])
  const kick = createInstrument(db, { name: 'Kick' })
  const snare = createInstrument(db, { name: 'Snare' })
  const empty = readSampleInstruments(db, { sampleId: sample.id })
  setInstrumentAssignment(db, {
    id: kick.id,
    target: { kind: 'sample', id: sample.id },
    assigned: true,
  })
  assert.throws(
    () =>
      saveSampleInstruments(db, {
        sampleId: sample.id,
        token: empty.token,
        instrumentIds: [],
      }),
    { code: 'STALE_REVIEW' },
  )
  const current = readSampleInstruments(db, { sampleId: sample.id })
  assert.throws(
    () =>
      saveSampleInstruments(db, {
        sampleId: sample.id,
        token: current.token,
        instrumentIds: [snare.id, '00000000-0000-4000-8000-000000000099'],
      }),
    { code: 'NOT_FOUND' },
  )
  native.exec(
    "CREATE TRIGGER fail_manual_instrument BEFORE INSERT ON sample_categories BEGIN SELECT RAISE(ABORT, 'injected'); END",
  )
  assert.throws(() =>
    saveSampleInstruments(db, {
      sampleId: sample.id,
      token: current.token,
      instrumentIds: [snare.id],
    }),
  )
  assert.deepEqual(db.select().from(sampleInstruments).all(), [
    { sampleId: sample.id, instrumentId: kick.id },
  ])
})
