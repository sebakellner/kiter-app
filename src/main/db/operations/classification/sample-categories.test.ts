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
import { createCategory, setCategoryAssignment } from './operations.ts'
import {
  readSampleCategories,
  saveSampleCategories,
} from './sample-categories.ts'
import { samples, sampleSources } from '../../schema/samples.ts'
import { sampleCategories } from '../../schema/classification.ts'

test('manual category replacement and clearing survive reopening and preserve unrelated Sample state', async (t) => {
  const disk = await createDiskDatabase(t)
  let db = disk.connection.db
  const root = path.resolve('manual-categories')
  const [sample] = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'kick.wav'),
  ])
  const kick = createCategory(db, { name: 'Kick' })
  const snare = createCategory(db, { name: 'Snare' })
  setCategoryAssignment(db, {
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
  const snapshot = readSampleCategories(db, { sampleId: sample.id })
  saveSampleCategories(db, {
    sampleId: sample.id,
    token: snapshot.token,
    categoryIds: [snare.id],
  })
  db = disk.reopen().db
  const saved = readSampleCategories(db, { sampleId: sample.id })
  assert.deepEqual(saved.categories, [snare])
  assert.deepEqual(db.select().from(samples).all(), before)
  assert.deepEqual(db.select().from(sampleSources).all(), sources)
  saveSampleCategories(db, {
    sampleId: sample.id,
    token: saved.token,
    categoryIds: [],
  })
  db = disk.reopen().db
  assert.deepEqual(
    readSampleCategories(db, { sampleId: sample.id }).categories,
    [],
  )
})

test('stale, missing and failed saves retain every previous category assignment', (t) => {
  const { db, native } = createMemoryDatabase(t)
  const root = path.resolve('manual-categories')
  const [sample] = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'kick.wav'),
  ])
  const kick = createCategory(db, { name: 'Kick' })
  const snare = createCategory(db, { name: 'Snare' })
  const empty = readSampleCategories(db, { sampleId: sample.id })
  setCategoryAssignment(db, {
    id: kick.id,
    target: { kind: 'sample', id: sample.id },
    assigned: true,
  })
  assert.throws(
    () =>
      saveSampleCategories(db, {
        sampleId: sample.id,
        token: empty.token,
        categoryIds: [],
      }),
    { code: 'STALE_REVIEW' },
  )
  const current = readSampleCategories(db, { sampleId: sample.id })
  assert.throws(
    () =>
      saveSampleCategories(db, {
        sampleId: sample.id,
        token: current.token,
        categoryIds: [snare.id, '00000000-0000-4000-8000-000000000099'],
      }),
    { code: 'NOT_FOUND' },
  )
  native.exec(
    "CREATE TRIGGER fail_manual_category BEFORE INSERT ON sample_categories BEGIN SELECT RAISE(ABORT, 'injected'); END",
  )
  assert.throws(() =>
    saveSampleCategories(db, {
      sampleId: sample.id,
      token: current.token,
      categoryIds: [snare.id],
    }),
  )
  assert.deepEqual(db.select().from(sampleCategories).all(), [
    { sampleId: sample.id, categoryId: kick.id },
  ])
})
