import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { eq } from 'drizzle-orm'
import { openDatabase } from '../src/main/db/connection.ts'
import * as operations from '../src/main/db/operations/sampleLifecycle.ts'
import { importFolder } from '../src/main/db/operations/sources.ts'
import { setFavorite } from '../src/main/db/operations/samples.ts'
import * as classification from '../src/main/db/operations/classification.ts'
import * as collections from '../src/main/db/operations/collections.ts'
import {
  samples,
  sampleSources,
  sourceRoots,
  sourceRootSamples,
  packs,
  sampleCategories,
  sampleAuthors,
  collectionSamples,
} from '../src/main/db/schema/index.ts'
import {
  requireSampleDisplayName,
  requireSampleNotes,
} from '../src/shared/domain/sample.ts'
import { isDbRequest, isDbReply } from '../src/main/db/protocol.ts'
import { reincludeLibrarySource } from '../src/main/services/library/library.ts'

const migrations = fileURLToPath(new URL('../drizzle', import.meta.url))
const open = (): ReturnType<typeof openDatabase> =>
  openDatabase(':memory:', migrations)
function fixture(db: ReturnType<typeof open>['db']): {
  root: string
  file: import('../src/shared/domain/source.ts').DiscoveredAudioFile
  id: string
} {
  const root = path.resolve('samples-fixture')
  const file = {
    name: 'kick.wav',
    path: path.join(root, 'nested', 'kick.wav'),
    relativePath: path.join('nested', 'kick.wav'),
    observedSizeBytes: 100,
    observedMtimeMs: 1000,
  }
  const [sample] = importFolder(db, root, [file])
  importFolder(db, path.join(root, 'nested'), [file])
  return { root, file, id: sample.id }
}

test('Sample presentation validates optional Unicode names and multiline notes', () => {
  assert.equal(requireSampleDisplayName(' E\u0301cho '), 'Écho')
  assert.equal(requireSampleDisplayName('😀'.repeat(120)), '😀'.repeat(120))
  for (const value of [null, undefined, '', '   ']) {
    assert.equal(requireSampleDisplayName(value), null)
  }
  for (const value of ['\n', '\t', 'a\u2028b', 'a\0b', '😀'.repeat(121), 42]) {
    assert.throws(() => requireSampleDisplayName(value), {
      code: 'INVALID_INPUT',
    })
  }
  assert.equal(requireSampleNotes(' E\u0301cho\r\n'), ' Écho\r\n')
  assert.equal(requireSampleNotes('😀'.repeat(5000)), '😀'.repeat(5000))
  assert.equal(requireSampleNotes(' \n '), null)
  for (const value of ['😀'.repeat(5001), '\t', '\0', 1]) {
    assert.throws(() => requireSampleNotes(value), { code: 'INVALID_INPUT' })
  }
})

test('Sample edits survive rescans and preserve source revisions and organization', (t) => {
  const { db, close } = open()
  t.after(close)
  const { id, root, file } = fixture(db)
  setFavorite(db, id, true)
  const before = operations.getSample(db, id)
  const source = db.select().from(sampleSources).get()
  const edited = operations.updateSample(db, {
    id,
    displayName: ' Kick ',
    notes: 'Keep\nnotes',
  })
  assert.deepEqual(edited, {
    ...before,
    displayName: 'Kick',
    notes: 'Keep\nnotes',
  })
  assert.deepEqual(db.select().from(sampleSources).get(), source)
  assert.throws(
    () =>
      operations.updateSample(db, { id, displayName: 'Other', notes: '\0' }),
    { code: 'INVALID_INPUT' },
  )
  assert.deepEqual(operations.getSample(db, id), edited)
  importFolder(db, root, [{ ...file, observedSizeBytes: 200 }])
  assert.deepEqual(operations.getSample(db, id), edited)
  assert.equal(db.select().from(sampleSources).get()!.revision, 2)
  assert.deepEqual(operations.updateSample(db, { id }), before)
  assert.throws(() => operations.getSample(db, randomUUID()), {
    code: 'NOT_FOUND',
  })
  assert.throws(() => operations.updateSample(db, { id: randomUUID() }), {
    code: 'NOT_FOUND',
  })
})

test('Sample removal checks exact impact, rolls back failures and excludes across overlapping roots', (t) => {
  const { db, native, close } = open()
  t.after(close)
  const { id, root, file } = fixture(db)
  const rootId = db.select().from(sourceRoots).get()!.id
  const packId = randomUUID()
  db.insert(packs)
    .values({ id: packId, name: 'Origin', sourceRootId: rootId })
    .run()
  db.update(samples).set({ packId }).where(eq(samples.id, id)).run()
  setFavorite(db, id, true)
  operations.updateSample(db, { id, displayName: 'Kick', notes: 'Notes' })
  const category = classification.createCategory(db, { name: 'Drums' })
  const author = classification.createAuthor(db, { name: 'Artist' })
  classification.setCategoryAssignment(db, {
    id: category.id,
    target: { kind: 'sample', id },
    assigned: true,
  })
  classification.setAuthorAssignment(db, {
    id: author.id,
    target: { kind: 'sample', id },
    assigned: true,
  })
  const collection = collections.createCollection(db, { name: 'Selection' })
  collections.setCollectionMembership(db, {
    collectionId: collection.id,
    sampleId: id,
    assigned: true,
  })
  const review = operations.reviewSampleRemoval(db, id)
  assert.deepEqual(
    [
      review.collectionCount,
      review.categoryCount,
      review.authorCount,
      review.rootCount,
    ],
    [1, 1, 1, 2],
  )
  for (const kind of ['collection', 'category', 'author', 'root'] as const) {
    const references = operations.listSampleReferences(db, {
      id,
      kind,
      limit: 1,
    })
    assert.equal(references.items.length, 1)
    assert.equal(references.total, kind === 'root' ? 2 : 1)
  }
  const replacement = classification.createCategory(db, { name: 'Hits' })
  classification.setCategoryAssignment(db, {
    id: category.id,
    target: { kind: 'sample', id },
    assigned: false,
  })
  classification.setCategoryAssignment(db, {
    id: replacement.id,
    target: { kind: 'sample', id },
    assigned: true,
  })
  assert.throws(
    () => operations.removeSample(db, { id, token: review.token }),
    { code: 'STALE_REVIEW' },
  )
  const fresh = operations.reviewSampleRemoval(db, id)
  native.exec(
    "CREATE TEMP TRIGGER fail_sample_delete BEFORE DELETE ON samples BEGIN SELECT RAISE(ABORT, 'injected'); END",
  )
  assert.throws(() => operations.removeSample(db, { id, token: fresh.token }))
  assert.equal(operations.listExcludedSources(db).total, 0)
  assert.deepEqual(operations.getSample(db, id), fresh.entity)
  native.exec('DROP TRIGGER fail_sample_delete')
  operations.removeSample(db, { id, token: fresh.token })
  for (const table of [
    samples,
    sampleSources,
    sampleCategories,
    sampleAuthors,
    collectionSamples,
    sourceRootSamples,
  ]) {
    assert.equal(db.select().from(table).all().length, 0)
  }
  assert.equal(collections.getCollection(db, collection.id).id, collection.id)
  assert.equal(db.select().from(packs).get()!.id, packId)
  assert.deepEqual(operations.listExcludedSources(db).items, [
    { canonicalPath: file.path },
  ])
  assert.deepEqual(importFolder(db, root, [file]), [])
  assert.deepEqual(importFolder(db, path.dirname(file.path), [file]), [])
  assert.throws(() => operations.removeSample(db, { id, token: '' }), {
    code: 'INVALID_INPUT',
  })
  const input = { canonicalPath: file.path, sourceRootId: rootId }
  native.exec(
    "CREATE TEMP TRIGGER fail_reinclude BEFORE INSERT ON sample_sources BEGIN SELECT RAISE(ABORT, 'injected'); END",
  )
  assert.throws(() => operations.reincludeSource(db, input, file))
  assert.equal(operations.listExcludedSources(db).total, 1)
  assert.equal(db.select().from(samples).all().length, 0)
  native.exec('DROP TRIGGER fail_reinclude')
  const reincluded = operations.reincludeSource(db, input, file)
  assert.notEqual(reincluded.id, id)
  assert.deepEqual(reincluded, {
    id: reincluded.id,
    displayName: null,
    notes: null,
    favorite: false,
    packId: null,
    originAssignment: 'manual',
  })
  assert.equal(operations.listExcludedSources(db).total, 0)
  assert.equal(importFolder(db, root, [file])[0].id, reincluded.id)
  assert.throws(() => operations.reincludeSource(db, input, file), {
    code: 'NOT_FOUND',
  })
})

test('Sample removal tokens detect presentation, source, origin, Favorite, order and root changes', (t) => {
  const { db, close } = open()
  t.after(close)
  const { id, root, file } = fixture(db)
  const collection = collections.createCollection(db, { name: 'Selection' })
  collections.setCollectionMembership(db, {
    collectionId: collection.id,
    sampleId: id,
    assigned: true,
  })
  const mutations = [
    () => operations.updateSample(db, { id, notes: 'Changed' }),
    () => setFavorite(db, id, true),
    () => importFolder(db, root, [{ ...file, observedSizeBytes: 200 }]),
    () => db.update(samples).set({ originAssignment: 'manual' }).run(),
    () => db.update(collectionSamples).set({ position: 3 }).run(),
    () =>
      db
        .delete(sourceRootSamples)
        .where(
          eq(
            sourceRootSamples.sourceRootId,
            db.select().from(sourceRoots).get()!.id,
          ),
        )
        .run(),
  ]
  for (const mutate of mutations) {
    const review = operations.reviewSampleRemoval(db, id)
    mutate()
    assert.throws(
      () => operations.removeSample(db, { id, token: review.token }),
      { code: 'STALE_REVIEW' },
    )
  }
})

test('Sample reference impact and pagination cover more than one review batch', (t) => {
  const { db, close } = open()
  t.after(close)
  const { id } = fixture(db)
  for (let index = 0; index < 505; index++) {
    const collection = collections.createCollection(db, {
      name: `Selection ${index}`,
    })
    collections.setCollectionMembership(db, {
      collectionId: collection.id,
      sampleId: id,
      assigned: true,
    })
  }
  assert.equal(operations.reviewSampleRemoval(db, id).collectionCount, 505)
  const page = operations.listSampleReferences(db, {
    id,
    kind: 'collection',
    offset: 500,
  })
  assert.equal(page.total, 505)
  assert.equal(page.items.length, 5)
  assert.deepEqual(
    operations.listSampleReferences(db, { id, kind: 'collection', offset: 600 })
      .items,
    [],
  )
  for (const input of [{ limit: 101 }, { limit: 0 }, { offset: -1 }]) {
    assert.throws(() => operations.listExcludedSources(db, input), {
      code: 'INVALID_INPUT',
    })
  }
})

test('Reinclusion verifies readable canonical audio, rejects symlinks and preserves exclusions on failure', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'kiter-reinclude-'))
  const { db, close } = open()
  t.after(async () => {
    close()
    await rm(directory, { recursive: true, force: true })
  })
  const root = await realpath(directory)
  await mkdir(path.join(root, 'nested'))
  const location = path.join(root, 'nested', 'sample.wav')
  const bytes = Buffer.from('original source')
  await writeFile(location, bytes)
  const file = {
    name: 'sample.wav',
    path: location,
    relativePath: path.join('nested', 'sample.wav'),
    observedSizeBytes: bytes.length,
    observedMtimeMs: 0,
  }
  const [sample] = importFolder(db, root, [file])
  const review = operations.reviewSampleRemoval(db, sample.id)
  operations.removeSample(db, { id: sample.id, token: review.token })
  const input = {
    canonicalPath: location,
    sourceRootId: db.select().from(sourceRoots).get()!.id,
  }
  const database = {
    getReinclusionRoot: async (request: typeof input) =>
      operations.getReinclusionRoot(db, request),
    reincludeSource: async (request: typeof input, observation: typeof file) =>
      operations.reincludeSource(db, request, observation),
  }
  assert.deepEqual(await readFile(location), bytes)
  await rm(location)
  await assert.rejects(reincludeLibrarySource(input, database), {
    code: 'FOLDER_FAILED',
  })
  assert.equal(operations.listExcludedSources(db).total, 1)
  const target = path.join(root, 'target.wav')
  await writeFile(target, bytes)
  await symlink(target, location)
  await assert.rejects(reincludeLibrarySource(input, database), {
    code: 'FOLDER_FAILED',
  })
  await rm(location)
  await writeFile(location, bytes)
  await rm(path.join(root, 'nested'), { recursive: true })
  const outside = path.join(root, 'outside')
  await mkdir(outside)
  await writeFile(path.join(outside, 'sample.wav'), bytes)
  await symlink(outside, path.join(root, 'nested'), 'dir')
  await assert.rejects(reincludeLibrarySource(input, database), {
    code: 'FOLDER_FAILED',
  })
  await rm(path.join(root, 'nested'))
  await mkdir(path.join(root, 'nested'))
  await writeFile(location, bytes)
  const unrelatedRoot = path.join(root, 'unrelated')
  importFolder(db, unrelatedRoot, [])
  const unrelatedId = db
    .select()
    .from(sourceRoots)
    .where(eq(sourceRoots.canonicalPath, unrelatedRoot))
    .get()!.id
  assert.throws(
    () =>
      operations.getReinclusionRoot(db, {
        ...input,
        sourceRootId: unrelatedId,
      }),
    { code: 'INVALID_INPUT' },
  )
  db.update(sourceRoots).set({ registered: false }).run()
  await assert.rejects(reincludeLibrarySource(input, database), {
    code: 'NOT_FOUND',
  })
  db.update(sourceRoots).set({ registered: true }).run()
  const reincluded = await reincludeLibrarySource(input, database)
  assert.notEqual(reincluded.id, sample.id)
  assert.equal(
    db.select().from(sampleSources).get()!.observedSizeBytes,
    bytes.length,
  )
  assert.deepEqual(await readFile(location), bytes)
})

test('Sample worker protocol validates requests and reply shapes', () => {
  const id = randomUUID()
  const entity = {
    id,
    displayName: null,
    notes: null,
    favorite: false,
    packId: null,
    originAssignment: 'manual',
  }
  assert.ok(
    isDbRequest({
      requestId: 1,
      action: 'update-sample',
      input: { id, displayName: 'Kick' },
    }),
  )
  assert.ok(isDbReply({ requestId: 1, action: 'get-sample', result: entity }))
  for (const input of [null, {}, { id, displayName: '\n' }, { id, notes: 1 }]) {
    assert.equal(
      isDbRequest({ requestId: 1, action: 'update-sample', input }),
      false,
    )
  }
  assert.equal(
    isDbRequest({
      requestId: 1,
      action: 'remove-sample',
      input: { id, token: '' },
    }),
    false,
  )
  assert.equal(
    isDbRequest({
      requestId: 1,
      action: 'list-sample-references',
      input: { id, kind: 'pack' },
    }),
    false,
  )
  for (const result of [
    { ...entity, displayName: ' Kick ' },
    { ...entity, notes: undefined },
    { ...entity, packId: 'bad' },
    { ...entity, favorite: 1 },
  ]) {
    assert.equal(
      isDbReply({ requestId: 1, action: 'get-sample', result }),
      false,
    )
  }
  assert.equal(
    isDbReply({
      requestId: 1,
      action: 'list-excluded-sources',
      result: {
        items: [{ canonicalPath: '/sample.wav' }],
        total: 0,
        limit: 50,
        offset: 0,
      },
    }),
    false,
  )
})
