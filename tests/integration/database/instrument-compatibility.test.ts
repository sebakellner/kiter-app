import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { test } from 'node:test'
import { createDiskDatabase } from '../../support/database/connection.ts'
import { makeDiscoveredAudioFile } from '../../support/fixtures/source.ts'
import { makePackInsert } from '../../support/database/factories/pack.ts'
import { importFolder } from '../../../src/main/db/operations/sources/import.ts'
import { packs } from '../../../src/main/db/schema/packs.ts'
import { sourceRoots } from '../../../src/main/db/schema/sources.ts'
import { readSampleInstruments } from '../../../src/main/db/operations/classification/sample-instruments.ts'
import {
  createInstrument,
  listTargetInstruments,
} from '../../../src/main/db/operations/classification/operations.ts'
import {
  listRecognitionVocabulary,
  writeRecognitionAlias,
} from '../../../src/main/db/operations/classification/vocabulary.ts'
import { listCatalogSamples } from '../../../src/main/db/operations/samples/catalog.ts'

test('legacy Category storage opens as Instruments without changing identities, assignments or alias history', async (t) => {
  const disk = await createDiskDatabase(t)
  const { db, native } = disk.connection
  const root = path.resolve('legacy-instrument-fixture')
  const [sample] = importFolder(db, root, [
    makeDiscoveredAudioFile(root, 'kick.wav'),
  ])
  const sourceRoot = db.select().from(sourceRoots).get()!
  const packId = randomUUID()
  db.insert(packs).values(makePackInsert(packId, sourceRoot.id)).run()
  const kickId = randomUUID()
  const fxId = randomUUID()
  const customKey = `category:${fxId}`
  // Seed the pre-rename SQL representation, including user edits and deletion memory.
  const insert = native.prepare(
    'INSERT INTO categories(id, name, name_key) VALUES (?, ?, ?)',
  )
  insert.run(kickId, 'Punch', 'punch')
  insert.run(fxId, 'Transition FX', 'transition fx')
  native
    .prepare(
      "UPDATE recognition_vocabulary SET category_id = ?, name = 'Punch' WHERE key = 'category:kick'",
    )
    .run(kickId)
  native
    .prepare(
      "INSERT INTO recognition_vocabulary(key, dimension, name, category_id, state) VALUES (?, 'category', 'Transition FX', ?, 'active')",
    )
    .run(customKey, fxId)
  native
    .prepare(
      'INSERT INTO sample_categories(sample_id, category_id) VALUES (?, ?)',
    )
    .run(sample.id, kickId)
  native
    .prepare(
      'INSERT INTO sample_categories(sample_id, category_id) VALUES (?, ?)',
    )
    .run(sample.id, fxId)
  native
    .prepare('INSERT INTO pack_categories(pack_id, category_id) VALUES (?, ?)')
    .run(packId, fxId)
  native
    .prepare(
      "UPDATE recognition_vocabulary SET state = 'deleted' WHERE key = 'category:snare'",
    )
    .run()
  native
    .prepare(
      "UPDATE recognition_aliases SET deleted = 1 WHERE target_key = 'category:snare' OR supplied_key = 'category:kick:kicks'",
    )
    .run()
  native
    .prepare(
      "UPDATE recognition_aliases SET target_key = ?, term = 'Low Hit', term_key = 'low hit' WHERE supplied_key = 'category:kick:bd'",
    )
    .run(customKey)
  const aliasId = randomUUID()
  native
    .prepare(
      "INSERT INTO recognition_aliases(id, target_key, term, term_key, dimension) VALUES (?, 'category:kick', 'Knock', 'knock', 'category')",
    )
    .run(aliasId)

  const snapshot = (connection: typeof disk.connection): unknown => ({
    schema: connection.native
      .prepare(
        'SELECT name, sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY name',
      )
      .all(),
    version: connection.native.pragma('user_version', { simple: true }),
    instruments: connection.native
      .prepare('SELECT * FROM categories ORDER BY id')
      .all(),
    sampleAssignments: connection.native
      .prepare(
        'SELECT * FROM sample_categories ORDER BY sample_id, category_id',
      )
      .all(),
    packAssignments: connection.native
      .prepare('SELECT * FROM pack_categories ORDER BY pack_id, category_id')
      .all(),
    vocabulary: connection.native
      .prepare('SELECT * FROM recognition_vocabulary ORDER BY key')
      .all(),
    aliases: connection.native
      .prepare('SELECT * FROM recognition_aliases ORDER BY id')
      .all(),
  })
  const before = snapshot(disk.connection)
  const reopened = disk.reopen()
  assert.deepEqual(snapshot(reopened), before)
  assert.deepEqual(
    readSampleInstruments(reopened.db, { sampleId: sample.id }).instruments,
    [
      { id: kickId, name: 'Punch' },
      { id: fxId, name: 'Transition FX' },
    ].sort((a, b) => a.id.localeCompare(b.id)),
  )
  assert.deepEqual(
    listTargetInstruments(reopened.db, { kind: 'pack', id: packId }).items,
    [{ id: fxId, name: 'Transition FX' }],
  )
  const vocabulary = listRecognitionVocabulary(reopened.db, { limit: 100 })
  assert.equal(
    vocabulary.items.find(({ key }) => key === customKey)?.dimension,
    'instrument',
  )
  assert.equal(
    vocabulary.items.find(({ key }) => key === 'category:snare')?.state,
    'deleted',
  )
  assert.deepEqual(
    listCatalogSamples(reopened.db, { instrumentIds: [fxId] }).items.map(
      ({ id }) => id,
    ),
    [sample.id],
  )
  assert.deepEqual(
    writeRecognitionAlias(reopened.db, {
      id: aliasId,
      targetKey: customKey,
      term: 'Knock',
    }),
    {
      id: aliasId,
      targetKey: customKey,
      term: 'Knock',
      suppliedKey: null,
    },
  )
  assert.deepEqual(
    reopened.native
      .prepare(
        'SELECT target_key, dimension FROM recognition_aliases WHERE id = ?',
      )
      .get(aliasId),
    { target_key: customKey, dimension: 'category' },
  )
  const created = createInstrument(reopened.db, { name: 'Custom Texture' })
  assert.deepEqual(
    reopened.native
      .prepare(
        'SELECT key, dimension FROM recognition_vocabulary WHERE category_id = ?',
      )
      .get(created.id),
    { key: `category:${created.id}`, dimension: 'category' },
  )
  assert.deepEqual(
    disk
      .reopen()
      .native.prepare(
        'SELECT target_key, dimension FROM recognition_aliases WHERE id = ?',
      )
      .get(aliasId),
    { target_key: customKey, dimension: 'category' },
  )
})
