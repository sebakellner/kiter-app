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
import { listGenres, setGenreAssignment, renameGenre } from './genres.ts'
import { readSampleGenres, saveSampleGenres } from './sample-genres.ts'
import { samples, sampleSources } from '../../schema/samples.ts'
import { sampleInstruments } from '../../schema/classification.ts'
import { sampleGenres } from '../../schema/recognition.ts'

test('manual Genre replacement and clearing persist across reopen and rescan without changing other organization', async (t) => {
  const disk = await createDiskDatabase(t)
  let db = disk.connection.db
  const root = path.resolve('manual-genres')
  const files = [makeDiscoveredAudioFile(root, 'kick.wav')]
  const [sample] = importFolder(db, root, files)
  const house = listGenres(db, { search: 'House' }).items.find(
    ({ name }) => name === 'House',
  )!
  const techno = listGenres(db, { search: 'Techno' }).items[0]
  const instrument = createInstrument(db, { name: 'Kick' })
  setInstrumentAssignment(db, {
    id: instrument.id,
    target: { kind: 'sample', id: sample.id },
    assigned: true,
  })
  db.update(samples)
    .set({ favorite: true, notes: 'Preserve notes', sampleType: 'loop' })
    .where(eq(samples.id, sample.id))
    .run()
  setGenreAssignment(db, {
    id: house.id,
    target: { kind: 'sample', id: sample.id },
    assigned: true,
  })
  const before = db.select().from(samples).all()
  const sources = db.select().from(sampleSources).all()
  const snapshot = readSampleGenres(db, { sampleId: sample.id })
  saveSampleGenres(db, {
    sampleId: sample.id,
    token: snapshot.token,
    genreIds: [techno.id],
  })
  db = disk.reopen().db
  assert.deepEqual(readSampleGenres(db, { sampleId: sample.id }).genres, [
    techno,
  ])
  assert.deepEqual(db.select().from(samples).all(), before)
  assert.deepEqual(db.select().from(sampleSources).all(), sources)
  importFolder(db, root, files)
  assert.deepEqual(readSampleGenres(db, { sampleId: sample.id }).genres, [
    techno,
  ])
  assert.deepEqual(db.select().from(sampleInstruments).all(), [
    { sampleId: sample.id, instrumentId: instrument.id },
  ])
  saveSampleGenres(db, {
    sampleId: sample.id,
    token: readSampleGenres(db, { sampleId: sample.id }).token,
    genreIds: [],
  })
  db = disk.reopen().db
  assert.deepEqual(readSampleGenres(db, { sampleId: sample.id }).genres, [])
})

test('Genre stale state, missing targets and late failures never partially replace assignments', (t) => {
  const { db, native } = createMemoryDatabase(t)
  const root = path.resolve('manual-genres')
  const [sample] = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'kick.wav'),
  ])
  const [first, second] = listGenres(db).items
  const empty = readSampleGenres(db, { sampleId: sample.id })
  setGenreAssignment(db, {
    id: first.id,
    target: { kind: 'sample', id: sample.id },
    assigned: true,
  })
  assert.throws(
    () =>
      saveSampleGenres(db, {
        sampleId: sample.id,
        token: empty.token,
        genreIds: [],
      }),
    { code: 'STALE_REVIEW' },
  )
  const beforeRename = readSampleGenres(db, { sampleId: sample.id })
  renameGenre(db, { id: first.id, name: 'Custom renamed genre' })
  assert.throws(
    () =>
      saveSampleGenres(db, {
        sampleId: sample.id,
        token: beforeRename.token,
        genreIds: [],
      }),
    { code: 'STALE_REVIEW' },
  )
  const current = readSampleGenres(db, { sampleId: sample.id })
  assert.throws(
    () =>
      saveSampleGenres(db, {
        sampleId: sample.id,
        token: current.token,
        genreIds: [second.id, '00000000-0000-4000-8000-000000000099'],
      }),
    { code: 'NOT_FOUND' },
  )
  native.exec(
    "CREATE TRIGGER fail_genre_editor BEFORE INSERT ON sample_genres BEGIN SELECT RAISE(ABORT, 'injected'); END",
  )
  assert.throws(() =>
    saveSampleGenres(db, {
      sampleId: sample.id,
      token: current.token,
      genreIds: [second.id],
    }),
  )
  assert.deepEqual(db.select().from(sampleGenres).all(), [
    { sampleId: sample.id, genreId: first.id },
  ])
})
