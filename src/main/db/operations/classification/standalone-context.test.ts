import assert from 'node:assert/strict'
import { test } from 'node:test'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { createMemoryDatabase } from '../../../../../tests/support/database/connection.ts'
import { makeDiscoveredAudioFile } from '../../../../../tests/support/fixtures/source.ts'
import { readStandaloneClassificationContext } from './standalone-context.ts'
import type { StandaloneClassificationContextRequest } from '../../../../shared/features/classification/standalone-context-schemas.ts'
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
import {
  recognitionVocabulary,
  sampleSources,
  sourceRoots,
} from '../../schema/index.ts'
import { isDbRequest, isDbReply } from '../../protocol/messages.ts'
import { dispatchRequest } from '../../worker/dispatch.ts'

test('standalone context reads paged vocabulary, catalog evidence and origin Genres without catalog writes', (t) => {
  const { db, native } = createMemoryDatabase(t)
  const root = path.resolve('standalone-context')
  const file = makeDiscoveredAudioFile(root, path.join('Drums', 'kick.wav'))
  const sample = importFolder(db, root, [file])[0]
  const source = getPackSourceRoot(db, root)
  const pack = importPack(db, {
    sourceRootId: source.id,
    name: 'Pack',
    decisions: [],
    token: reviewPackImport(db, source.id).token,
  })
  const instrument = createInstrument(db, { name: 'Kick' })
  const bass = createInstrument(db, { name: 'Bass' })
  const genre = createGenre(db, { name: 'Custom style' })
  setInstrumentAssignment(db, {
    id: instrument.id,
    target: { kind: 'sample', id: sample.id },
    assigned: true,
  })
  setInstrumentAssignment(db, {
    id: bass.id,
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
  const input = {
    targets: [
      { kind: 'sample' as const, id: sample.id },
      { kind: 'pack' as const, id: pack.id },
    ],
  }
  const first = readStandaloneClassificationContext(db, input)
  assert.equal(first.vocabulary.length, 100)
  assert.ok(first.vocabularyTotal > 100)
  const next = readStandaloneClassificationContext(db, {
    ...input,
    token: first.token,
    offset: 100,
  })
  assert.equal(next.token, first.token)
  assert.equal(next.vocabulary.length, first.vocabularyTotal - 100)
  assert.deepEqual(next.targets, first.targets)
  const context = first
  assert.equal(context.targets.length, 2)
  const [sampleTarget, packTarget] = context.targets
  assert.deepEqual(sampleTarget.target, { kind: 'sample', id: sample.id })
  assert.equal(sampleTarget.currentType, 'loop')
  assert.deepEqual(sampleTarget.assignments, [
    { dimension: 'instrument', key: 'instrument:bass' },
    { dimension: 'instrument', key: 'instrument:kick' },
  ])
  assert.deepEqual(sampleTarget.sources, [
    {
      rootId: source.id,
      rootPath: root,
      relativePath: path.join('Drums', 'kick.wav'),
      availability: 'available',
      canonicalPath: file.path,
    },
  ])
  assert.equal(sampleTarget.originPackId, pack.id)
  assert.deepEqual(sampleTarget.originGenreKeys, [`genre:${genre.id}`])
  assert.deepEqual(packTarget.target, { kind: 'pack', id: pack.id })
  assert.equal(packTarget.currentType, null)
  assert.deepEqual(packTarget.assignments, [
    { dimension: 'genre', key: `genre:${genre.id}` },
  ])
  assert.deepEqual(packTarget.sources, [
    {
      rootId: source.id,
      rootPath: root,
      relativePath: '',
      availability: null,
      canonicalPath: root,
    },
  ])
  assert.equal(packTarget.originPackId, null)
  assert.deepEqual(packTarget.originGenreKeys, [`genre:${genre.id}`])
  assert.deepEqual(native.serialize(), before)
  const request = {
    action: 'read-standalone-classification-context',
    input,
    requestId: 1,
  } as const
  assert.ok(isDbRequest(request))
  const reply = dispatchRequest(db, request)
  assert.ok(isDbReply(reply))
  assert.deepEqual(reply, {
    action: 'read-standalone-classification-context',
    requestId: 1,
    result: context,
  })
  writeRecognitionAlias(db, { targetKey: 'instrument:kick', term: 'Thud' })
  assert.throws(
    () =>
      readStandaloneClassificationContext(db, { ...input, token: first.token }),
    { code: 'STALE_REVIEW' },
  )
})

test('standalone context worker schemas reject invalid scopes and malformed replies', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('standalone-context-schemas')
  const sample = importFolder(db, root, [makeDiscoveredAudioFile(root)])[0]
  const target = { kind: 'sample' as const, id: sample.id }
  // Deliberately invalid payloads cross the worker boundary as untrusted input.
  const invalid: unknown[] = [
    {},
    { targets: [] },
    { offset: 100, targets: [target] },
    { token: 'a'.repeat(64), targets: [target, target] },
    {
      token: 'a'.repeat(64),
      targets: Array.from({ length: 101 }, (_, index) => ({
        kind: 'sample' as const,
        id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      })),
    },
    { offset: -1, targets: [target] },
    { targets: [target], extra: true },
    { targets: [{ kind: 'sample', id: 'not-a-uuid' }] },
    { targets: [{ kind: 'kit', id: sample.id }] },
  ]
  for (const input of invalid) {
    assert.equal(
      isDbRequest({
        requestId: 1,
        action: 'read-standalone-classification-context',
        input,
      }),
      false,
    )
    assert.throws(
      () =>
        readStandaloneClassificationContext(
          db,
          input as StandaloneClassificationContextRequest,
        ),
      { code: 'INVALID_INPUT' },
    )
  }
  const result = readStandaloneClassificationContext(db, { targets: [target] })
  assert.equal(
    isDbReply({
      requestId: 1,
      action: 'read-standalone-classification-context',
      result,
    }),
    true,
  )
  assert.equal(
    isDbReply({
      requestId: 1,
      action: 'read-standalone-classification-context',
      result: { ...result, token: 'invalid' },
    }),
    false,
  )
  assert.throws(
    () =>
      readStandaloneClassificationContext(db, {
        targets: [
          { kind: 'sample', id: '10000000-0000-4000-8000-000000000001' },
        ],
      }),
    { code: 'STALE_REVIEW' },
  )
})

test('standalone context fails DB_INTEGRITY when an assignment loses its vocabulary mapping', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('standalone-integrity')
  const sample = importFolder(db, root, [makeDiscoveredAudioFile(root)])[0]
  const instrument = createInstrument(db, { name: 'Kick' })
  setInstrumentAssignment(db, {
    id: instrument.id,
    target: { kind: 'sample', id: sample.id },
    assigned: true,
  })
  const input = { targets: [{ kind: 'sample' as const, id: sample.id }] }
  assert.deepEqual(
    readStandaloneClassificationContext(db, input).targets[0].assignments,
    [{ dimension: 'instrument', key: 'instrument:kick' }],
  )
  db.update(recognitionVocabulary)
    .set({ instrumentId: null })
    .where(eq(recognitionVocabulary.key, 'instrument:kick'))
    .run()
  assert.throws(() => readStandaloneClassificationContext(db, input), {
    code: 'DB_INTEGRITY',
  })
})

test('standalone context lists registered root evidence with availability and skips unregistered roots', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('standalone-roots')
  const file = makeDiscoveredAudioFile(root, path.join('Drums', 'kick.wav'))
  const sample = importFolder(db, root, [file])[0]
  importFolder(db, path.join(root, 'Drums'), [file])
  const nested = getPackSourceRoot(db, path.join(root, 'Drums'))
  const input = { targets: [{ kind: 'sample' as const, id: sample.id }] }
  const context = readStandaloneClassificationContext(db, input)
  assert.equal(context.targets[0].sources.length, 2)
  assert.deepEqual(
    new Set(context.targets[0].sources.map((source) => source.relativePath)),
    new Set([path.join('Drums', 'kick.wav'), 'kick.wav']),
  )
  for (const source of context.targets[0].sources) {
    assert.equal(source.availability, 'available')
    assert.equal(source.canonicalPath, file.path)
    assert.equal(path.join(source.rootPath, source.relativePath), file.path)
  }
  db.update(sampleSources)
    .set({ availability: 'missing', lastErrorCode: 'ENOENT' })
    .where(eq(sampleSources.sampleId, sample.id))
    .run()
  assert.ok(
    readStandaloneClassificationContext(db, input).targets[0].sources.every(
      (source) => source.availability === 'missing',
    ),
  )
  db.update(sourceRoots)
    .set({ registered: false })
    .where(eq(sourceRoots.id, nested.id))
    .run()
  assert.equal(
    readStandaloneClassificationContext(db, input).targets[0].sources.length,
    1,
  )
})

test('standalone context rejects samples with more than 100 root associations', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('standalone-source-bound')
  let directory = root
  for (let index = 0; index < 100; index++) {
    directory = path.join(directory, 'a')
  }
  const file = makeDiscoveredAudioFile(directory, 'kick.wav')
  let sample = importFolder(db, root, [file])[0]
  directory = root
  for (let index = 0; index < 100; index++) {
    directory = path.join(directory, 'a')
    sample = importFolder(db, directory, [file])[0]
  }
  assert.throws(
    () =>
      readStandaloneClassificationContext(db, {
        targets: [{ kind: 'sample', id: sample.id }],
      }),
    { code: 'INVALID_INPUT' },
  )
})

test('standalone context rejects serialized responses over the safety ceiling', (t) => {
  const { db } = createMemoryDatabase(t)
  const root = path.resolve('standalone-size-bound')
  const segment = 'd'.repeat(1000)
  let directory = root
  for (let index = 0; index < 100; index++) {
    directory = path.join(directory, segment)
  }
  const file = makeDiscoveredAudioFile(directory, 'kick.wav')
  const sample = importFolder(db, root, [file])[0]
  directory = root
  for (let index = 0; index < 99; index++) {
    directory = path.join(directory, segment)
    importFolder(db, directory, [file])
  }
  assert.throws(
    () =>
      readStandaloneClassificationContext(db, {
        targets: [{ kind: 'sample', id: sample.id }],
      }),
    { code: 'INVALID_INPUT' },
  )
})
