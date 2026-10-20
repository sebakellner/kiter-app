import assert from 'node:assert/strict'
import { test } from 'node:test'
import path from 'node:path'
import { createMemoryDatabase } from '../../../../../tests/support/database/connection.ts'
import { makeDiscoveredAudioFile } from '../../../../../tests/support/fixtures/source.ts'
import { readImportClassificationContext } from './import-context.ts'
import { createGenre, setGenreAssignment } from './genres.ts'
import { createInstrument, setInstrumentAssignment } from './operations.ts'
import { writeRecognitionAlias } from './vocabulary.ts'
import { saveSampleType, readSampleType } from './sample-type.ts'
import { importFolder } from '../sources/import.ts'
import {
  getPackSourceRoot,
  reviewPackImport,
  importPack,
} from '../packs/operations.ts'
import { isDbRequest, isDbReply } from '../../protocol/messages.ts'
import { dispatchRequest } from '../../worker/dispatch.ts'

test('import classification context reads paged vocabulary and independent saved assignments without catalog writes', (t) => {
  const { db, native } = createMemoryDatabase(t)
  const root = path.resolve('classification-context')
  const sample = importFolder(db, root, [makeDiscoveredAudioFile(root)])[0]
  const source = getPackSourceRoot(db, root)
  const pack = importPack(db, {
    sourceRootId: source.id,
    name: 'Pack',
    decisions: [],
    token: reviewPackImport(db, source.id).token,
  })
  const instrument = createInstrument(db, { name: 'Kick' })
  const genre = createGenre(db, { name: 'Custom style' })
  setInstrumentAssignment(db, {
    id: instrument.id,
    target: { kind: 'sample', id: sample.id },
    assigned: true,
  })
  setGenreAssignment(db, {
    id: genre.id,
    target: { kind: 'pack', id: pack.id },
    assigned: true,
  })
  saveSampleType(db, {
    ...readSampleType(db, { sampleId: sample.id }),
    sampleType: 'loop',
  })
  for (let index = 0; index < 60; index++) {
    createGenre(db, { name: `Extra genre ${index}` })
  }
  const before = native.serialize()
  const first = readImportClassificationContext(db, {})
  assert.equal(first.vocabulary.length, 100)
  assert.ok(first.vocabularyTotal > 100)
  const next = readImportClassificationContext(db, {
    token: first.token,
    offset: 100,
  })
  assert.equal(next.vocabulary.length, first.vocabularyTotal - 100)
  const input = {
    token: first.token,
    targets: [
      { kind: 'sample' as const, id: sample.id },
      { kind: 'pack' as const, id: pack.id },
    ],
  }
  const context = readImportClassificationContext(db, input)
  assert.equal(context.targets[0].currentType, 'loop')
  assert.deepEqual(context.targets[0].assignments, [
    { dimension: 'instrument', key: 'instrument:kick' },
  ])
  assert.deepEqual(context.targets[1].assignments, [
    { dimension: 'genre', key: `genre:${genre.id}` },
  ])
  assert.deepEqual(native.serialize(), before)
  const reply = dispatchRequest(db, {
    action: 'read-import-classification-context',
    input,
    requestId: 1,
  })
  assert.ok(isDbReply(reply))
  assert.deepEqual(reply, {
    action: 'read-import-classification-context',
    requestId: 1,
    result: context,
  })
  writeRecognitionAlias(db, { targetKey: 'instrument:kick', term: 'Thud' })
  assert.throws(() => readImportClassificationContext(db, input), {
    code: 'STALE_REVIEW',
  })
})

test('classification context worker schemas reject unpinned, duplicate and oversized target scopes and malformed replies', (t) => {
  const { db } = createMemoryDatabase(t)
  const target = {
    kind: 'sample' as const,
    id: '10000000-0000-4000-8000-000000000001',
  }
  for (const input of [
    { offset: 100 },
    { targets: [target] },
    { token: 'a'.repeat(64), targets: [target, target] },
    {
      token: 'a'.repeat(64),
      targets: Array.from({ length: 101 }, () => target),
    },
    { offset: -1 },
    { offset: 0, cover: 'unsupported' },
  ]) {
    assert.equal(
      isDbRequest({
        requestId: 1,
        action: 'read-import-classification-context',
        input,
      }),
      false,
    )
    assert.throws(() => readImportClassificationContext(db, input), {
      code: 'INVALID_INPUT',
    })
  }
  const result = readImportClassificationContext(db, {})
  assert.equal(
    isDbReply({
      requestId: 1,
      action: 'read-import-classification-context',
      result: { ...result, token: 'invalid' },
    }),
    false,
  )
  assert.throws(
    () =>
      readImportClassificationContext(db, {
        token: result.token,
        targets: [{ kind: 'sample', id: target.id }],
      }),
    { code: 'STALE_REVIEW' },
  )
})
