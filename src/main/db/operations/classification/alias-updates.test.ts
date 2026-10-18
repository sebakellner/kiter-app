import assert from 'node:assert/strict'
import { test } from 'node:test'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { createDiskDatabase } from '../../../../../tests/support/database/connection.ts'
import { makeDiscoveredAudioFile } from '../../../../../tests/support/fixtures/source.ts'
import { recognitionAliases } from '../../schema/recognition.ts'
import { listAliasUpdates, incorporateAlias } from './alias-updates.ts'
import { removeRecognitionAlias, writeRecognitionAlias } from './vocabulary.ts'
import { prepareSampleClassification } from './preparation.ts'
import { importFolder } from '../sources/import.ts'

test('explicit alias updates fix singular Drum evidence and survive reopen without restoring deletions', async (t) => {
  const disk = await createDiskDatabase(t)
  let db = disk.connection.db
  db.delete(recognitionAliases)
    .where(eq(recognitionAliases.suppliedKey, 'category:drums:drum'))
    .run()
  const root = path.resolve('Samples')
  const [sample] = importFolder(db, root, [
    makeDiscoveredAudioFile(
      root,
      'Vintage Drum Vol.1/100 bpm/100_001_Mic1_TG1_SP.wav',
    ),
  ])
  assert.equal(
    prepareSampleClassification(db, { sampleId: sample.id }).proposalCount,
    0,
  )
  const updates = listAliasUpdates(db)
  assert.equal(updates.total, 1)
  assert.equal(updates.items[0].term, 'Drum')
  assert.equal(
    prepareSampleClassification(db, { sampleId: sample.id }).proposalCount,
    0,
  )
  incorporateAlias(db, updates.items[0])
  const result = prepareSampleClassification(db, { sampleId: sample.id })
  assert.equal(result.proposalCount, 1)
  assert.ok(result.items.every((item) => item.name === 'Drums'))
  assert.equal(listAliasUpdates(db).total, 0)
  db = disk.reopen().db
  assert.equal(
    prepareSampleClassification(db, { sampleId: sample.id }).proposalCount,
    1,
  )
  const alias = db
    .select()
    .from(recognitionAliases)
    .where(eq(recognitionAliases.suppliedKey, updates.items[0].key))
    .get()!
  removeRecognitionAlias(db, alias.id)
  db = disk.reopen().db
  assert.equal(listAliasUpdates(db).total, 0)
  assert.equal(
    prepareSampleClassification(db, { sampleId: sample.id }).proposalCount,
    0,
  )
})

test('alias offers reject stale conflicts and never restore edited or reassigned supplied aliases', async (t) => {
  const disk = await createDiskDatabase(t)
  const db = disk.connection.db
  const supplied = db
    .select()
    .from(recognitionAliases)
    .where(eq(recognitionAliases.suppliedKey, 'category:drums:drum'))
    .get()!
  writeRecognitionAlias(db, {
    id: supplied.id,
    targetKey: 'category:kick',
    term: 'Drum',
  })
  assert.equal(listAliasUpdates(db).total, 0)
  db.delete(recognitionAliases)
    .where(eq(recognitionAliases.id, supplied.id))
    .run()
  const offer = listAliasUpdates(db).items[0]
  writeRecognitionAlias(db, { targetKey: 'category:snare', term: 'Drum' })
  assert.throws(() => incorporateAlias(db, offer), { code: 'STALE_REVIEW' })
  const blocked = listAliasUpdates(db).items[0]
  assert.ok(blocked.blockedReason)
  assert.throws(() => incorporateAlias(db, blocked), { code: 'NAME_CONFLICT' })
})
