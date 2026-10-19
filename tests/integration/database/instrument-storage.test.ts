import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { test } from 'node:test'
import {
  createDiskDatabase,
  createMemoryDatabase,
} from '../../support/database/connection.ts'
import { makeDiscoveredAudioFile } from '../../support/fixtures/source.ts'
import { makePackInsert } from '../../support/database/factories/pack.ts'
import { importFolder } from '../../../src/main/db/operations/sources/import.ts'
import { packs } from '../../../src/main/db/schema/packs.ts'
import { sourceRoots } from '../../../src/main/db/schema/sources.ts'
import { readSampleInstruments } from '../../../src/main/db/operations/classification/sample-instruments.ts'
import {
  createInstrument,
  listTargetInstruments,
  setInstrumentAssignment,
} from '../../../src/main/db/operations/classification/operations.ts'
import {
  listRecognitionVocabulary,
  writeRecognitionAlias,
} from '../../../src/main/db/operations/classification/vocabulary.ts'
import { listCatalogSamples } from '../../../src/main/db/operations/samples/catalog.ts'

test('the fresh baseline uses Instrument SQL names and recognition identities without a legacy adapter', (t) => {
  const { native } = createMemoryDatabase(t)
  const tables = native
    .prepare<[], { name: string; strict: number }>('PRAGMA table_list')
    .all()
  for (const name of [
    'instruments',
    'sample_instruments',
    'pack_instruments',
  ]) {
    assert.ok(tables.some((table) => table.name === name && table.strict === 1))
  }
  const definitions = native
    .prepare<[], { sql: string }>(
      'SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL',
    )
    .all()
  assert.ok(definitions.every(({ sql }) => !/categor/iu.test(sql)))
  for (const table of [
    'sample_instruments',
    'pack_instruments',
    'recognition_vocabulary',
  ]) {
    const columns = native
      .prepare<[], { name: string }>(`PRAGMA table_info("${table}")`)
      .all()
    assert.ok(columns.some(({ name }) => name === 'instrument_id'))
  }
  const vocabulary = native
    .prepare<[], { key: string }>(
      "SELECT key FROM recognition_vocabulary WHERE dimension = 'instrument'",
    )
    .all()
  assert.equal(vocabulary.length, 26)
  assert.ok(vocabulary.every(({ key }) => key.startsWith('instrument:')))
  const aliases = native
    .prepare<[], { target_key: string; supplied_key: string }>(
      "SELECT target_key, supplied_key FROM recognition_aliases WHERE dimension = 'instrument'",
    )
    .all()
  assert.ok(aliases.length > 0)
  assert.ok(
    aliases.every(
      (alias) =>
        alias.target_key.startsWith('instrument:') &&
        alias.supplied_key.startsWith('instrument:'),
    ),
  )
  assert.throws(() =>
    native
      .prepare(
        "INSERT INTO recognition_vocabulary(key, dimension, name, state) VALUES ('invalid', 'category', 'Invalid', 'active')",
      )
      .run(),
  )
  assert.equal(native.pragma('user_version', { simple: true }), 1)
})

test('Instrument assignments, custom vocabulary keys and aliases persist directly in the current SQL schema', async (t) => {
  const disk = await createDiskDatabase(t)
  const { db } = disk.connection
  const root = path.join(disk.directory, 'samples')
  const [sample] = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'kick.wav'),
  ])
  const sourceRoot = db.select().from(sourceRoots).get()!
  const packId = randomUUID()
  db.insert(packs).values(makePackInsert(packId, sourceRoot.id)).run()
  const instrument = createInstrument(db, { name: 'Transition FX' })
  for (const target of [
    { kind: 'sample', id: sample.id },
    { kind: 'pack', id: packId },
  ] as const) {
    setInstrumentAssignment(db, { id: instrument.id, target, assigned: true })
  }
  const key = `instrument:${instrument.id}`
  const alias = writeRecognitionAlias(db, { targetKey: key, term: 'Sweep' })
  const reopened = disk.reopen()
  assert.deepEqual(
    readSampleInstruments(reopened.db, { sampleId: sample.id }).instruments,
    [instrument],
  )
  assert.deepEqual(
    listTargetInstruments(reopened.db, { kind: 'pack', id: packId }).items,
    [instrument],
  )
  assert.deepEqual(
    reopened.native
      .prepare(
        'SELECT key, dimension FROM recognition_vocabulary WHERE instrument_id = ?',
      )
      .get(instrument.id),
    { key, dimension: 'instrument' },
  )
  assert.deepEqual(
    reopened.native
      .prepare(
        'SELECT target_key, dimension FROM recognition_aliases WHERE id = ?',
      )
      .get(alias.id),
    { target_key: key, dimension: 'instrument' },
  )
  assert.equal(
    listRecognitionVocabulary(reopened.db, { limit: 100 }).items.find(
      (entry) => entry.key === key,
    )?.entityId,
    instrument.id,
  )
  assert.deepEqual(
    listCatalogSamples(reopened.db, {
      instrumentIds: [instrument.id],
    }).items.map(({ id }) => id),
    [sample.id],
  )
  assert.deepEqual(
    reopened.native.prepare('PRAGMA foreign_key_check').all(),
    [],
  )
})
