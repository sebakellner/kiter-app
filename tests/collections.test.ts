import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { eq } from 'drizzle-orm'
import { openDatabase } from '../src/main/db/connection.ts'
import * as operations from '../src/main/db/operations/collections.ts'
import { importFolder } from '../src/main/db/operations/sources.ts'
import { setFavorite } from '../src/main/db/operations/samples.ts'
import * as classification from '../src/main/db/operations/classification.ts'
import {
  collections,
  collectionSamples,
  samples,
  packs,
  imageAssets,
  userProfiles,
} from '../src/main/db/schema/index.ts'
import { requireCollectionDescription } from '../src/shared/domain/collection.ts'
import type { CollectionMembership } from '../src/shared/domain/collection.ts'
import { requirePresentationName } from '../src/shared/domain/validation.ts'
import { isDbReply, isDbRequest } from '../src/main/db/protocol.ts'

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url))
const open = (): ReturnType<typeof openDatabase> =>
  openDatabase(':memory:', migrationsFolder)

function fixture(db: ReturnType<typeof open>['db'], size = 3): string[] {
  const root = path.resolve('collections-fixture')
  return importFolder(
    db,
    root,
    Array.from({ length: size }, (_, index) => ({
      name: `${index}.wav`,
      path: path.join(root, `${index}.wav`),
      relativePath: `${index}.wav`,
      observedSizeBytes: 100,
      observedMtimeMs: 1000,
    })),
  ).map((sample) => sample.id)
}

test('Collection text normalizes Unicode and enforces code-point and control boundaries', () => {
  assert.equal(requirePresentationName(' E\u0301lectro '), 'Électro')
  assert.equal(requirePresentationName('😀'.repeat(120)), '😀'.repeat(120))
  for (const value of [
    '',
    '   ',
    '\nName',
    'Name\t',
    'a\u2028b',
    'a\u0000b',
    '😀'.repeat(121),
    null,
  ]) {
    assert.throws(() => requirePresentationName(value), {
      code: 'INVALID_INPUT',
    })
  }
  assert.equal(
    requireCollectionDescription(' E\u0301lectro\nSecond line\r\n'),
    ' Électro\nSecond line\r\n',
  )
  assert.equal(
    requireCollectionDescription('😀'.repeat(5000)),
    '😀'.repeat(5000),
  )
  for (const value of [null, undefined, '', ' \n\r ']) {
    assert.equal(requireCollectionDescription(value), null)
  }
  for (const value of ['😀'.repeat(5001), 'a\u0000b', 'a\u0085b', 1, 'a\tb']) {
    assert.throws(() => requireCollectionDescription(value), {
      code: 'INVALID_INPUT',
    })
  }
})

test('Collections allow empty homonyms, validate edits and paginate deterministically', (t) => {
  const { db, close } = open()
  t.after(close)
  const first = operations.createCollection(db, {
    name: ' Same ',
    description: 'Notes',
  })
  const second = operations.createCollection(db, { name: 'Same' })
  assert.notEqual(first.id, second.id)
  assert.deepEqual(operations.listCollectionSamples(db, first.id).items, [])
  assert.deepEqual(operations.getCollection(db, first.id), first)
  assert.throws(
    () =>
      operations.updateCollection(db, {
        id: first.id,
        name: 'Changed',
        description: '\u0000',
      }),
    { code: 'INVALID_INPUT' },
  )
  assert.deepEqual(operations.getCollection(db, first.id), first)
  assert.deepEqual(
    operations.updateCollection(db, {
      id: first.id,
      name: ' Same ',
      description: ' ',
    }),
    { ...first, description: null },
  )
  for (let i = 0; i < 51; i++) {
    operations.createCollection(db, { name: 'Same' })
  }
  const page = operations.listCollections(db)
  assert.equal(page.total, 53)
  assert.equal(page.limit, 50)
  assert.equal(page.offset, 0)
  assert.equal(page.items.length, 50)
  const all = [
    ...page.items,
    ...operations.listCollections(db, { offset: 50 }).items,
  ]
  assert.deepEqual(
    all.map((row) => row.id),
    all.map((row) => row.id).sort(),
  )
  assert.equal(new Set(all.map((row) => row.id)).size, 53)
  assert.deepEqual(operations.listCollections(db, { offset: 100 }).items, [])
  for (const input of [
    { limit: 0 },
    { limit: 101 },
    { offset: -1 },
    { offset: 0.5 },
  ]) {
    assert.throws(() => operations.listCollections(db, input), {
      code: 'INVALID_INPUT',
    })
    assert.throws(() => operations.listCollectionSamples(db, first.id, input), {
      code: 'INVALID_INPUT',
    })
  }
  assert.throws(() => operations.getCollection(db, randomUUID()), {
    code: 'NOT_FOUND',
  })
  assert.throws(
    () =>
      operations.updateCollection(db, { id: randomUUID(), name: 'Missing' }),
    { code: 'NOT_FOUND' },
  )
})

test('Memberships append idempotently, retain gaps, reorder atomically and preserve unrelated organization', (t) => {
  const { db, native, close } = open()
  t.after(close)
  const ids = fixture(db)
  const collection = operations.createCollection(db, { name: 'Selection' })
  const other = operations.createCollection(db, { name: 'Other' })
  const packId = randomUUID()
  db.insert(packs)
    .values({
      id: packId,
      name: 'Origin',
      sourceRootId: db.query.sourceRoots.findFirst().sync()!.id,
    })
    .run()
  db.update(samples)
    .set({ packId, displayName: 'Kick', notes: 'Keep' })
    .where(eq(samples.id, ids[0]))
    .run()
  setFavorite(db, ids[0], true)
  const author = classification.createAuthor(db, { name: 'Artist' })
  const category = classification.createCategory(db, { name: 'Drums' })
  classification.setAuthorAssignment(db, {
    id: author.id,
    target: { kind: 'sample', id: ids[0] },
    assigned: true,
  })
  classification.setCategoryAssignment(db, {
    id: category.id,
    target: { kind: 'sample', id: ids[0] },
    assigned: true,
  })
  const before = db.select().from(samples).all()
  const set = (
    sampleId: string,
    assigned = true,
    collectionId = collection.id,
  ): void => {
    assert.deepEqual(
      operations.setCollectionMembership(db, {
        collectionId,
        sampleId,
        assigned,
      }),
      { assigned },
    )
  }
  set(ids[0], true, other.id)
  ids.forEach((id) => set(id))
  set(ids[0])
  const read = (): CollectionMembership[] =>
    operations.listCollectionSamples(db, collection.id).items
  assert.deepEqual(
    read().map((row) => row.sampleId),
    ids,
  )
  set(ids[1], false)
  set(ids[1], false)
  assert.deepEqual(
    read().map((row) => row.position),
    [0, 2],
  )
  set(ids[1])
  assert.deepEqual(
    read().map((row) => row.position),
    [0, 2, 3],
  )
  const order = [ids[1], ids[2], ids[0]]
  operations.reorderCollection(db, {
    collectionId: collection.id,
    sampleIds: order,
  })
  assert.deepEqual(
    read().map((row) => [row.sampleId, row.position]),
    order.map((id, index) => [id, index]),
  )
  for (const invalid of [
    ids.slice(1),
    [...ids, ids[0]],
    [...ids, randomUUID()],
    [ids[0], ids[1], randomUUID()],
  ]) {
    assert.throws(
      () =>
        operations.reorderCollection(db, {
          collectionId: collection.id,
          sampleIds: invalid,
        }),
      { code: 'INVALID_INPUT' },
    )
    assert.deepEqual(
      read().map((row) => row.sampleId),
      order,
    )
  }
  native.exec(
    `CREATE TEMP TRIGGER fail_reorder BEFORE INSERT ON collection_samples WHEN NEW.position = 1 BEGIN SELECT RAISE(ABORT, 'injected failure'); END`,
  )
  assert.throws(() =>
    operations.reorderCollection(db, {
      collectionId: collection.id,
      sampleIds: ids,
    }),
  )
  assert.deepEqual(
    read().map((row) => row.sampleId),
    order,
  )
  native.exec('DROP TRIGGER fail_reorder')
  assert.throws(() => set(randomUUID()), { code: 'NOT_FOUND' })
  assert.throws(() => set(ids[0], true, randomUUID()), { code: 'NOT_FOUND' })
  assert.deepEqual(db.select().from(samples).all(), before)
  assert.equal(
    classification.listTargetAuthors(db, { kind: 'sample', id: ids[0] }).total,
    1,
  )
  assert.equal(
    classification.listTargetCategories(db, { kind: 'sample', id: ids[0] })
      .total,
    1,
  )
  const review = operations.reviewCollectionRemoval(db, collection.id)
  operations.removeCollection(db, { id: collection.id, token: review.token })
  assert.deepEqual(db.select().from(samples).all(), before)
  assert.equal(
    operations.listCollectionSamples(db, other.id).items[0].sampleId,
    ids[0],
  )
})

test('Collection removal rejects changed exact membership, order and presentation reviews', (t) => {
  const { db, close } = open()
  t.after(close)
  const ids = fixture(db)
  const collection = operations.createCollection(db, { name: 'Selection' })
  const assign = (sampleId: string, assigned: boolean): { assigned: boolean } =>
    operations.setCollectionMembership(db, {
      collectionId: collection.id,
      sampleId,
      assigned,
    })
  assign(ids[0], true)
  assign(ids[1], true)
  let review = operations.reviewCollectionRemoval(db, collection.id)
  assert.equal(review.sampleCount, 2)
  assign(ids[0], false)
  assign(ids[2], true)
  assert.throws(
    () =>
      operations.removeCollection(db, {
        id: collection.id,
        token: review.token,
      }),
    { code: 'STALE_REVIEW' },
  )
  review = operations.reviewCollectionRemoval(db, collection.id)
  operations.reorderCollection(db, {
    collectionId: collection.id,
    sampleIds: [ids[2], ids[1]],
  })
  assert.throws(
    () =>
      operations.removeCollection(db, {
        id: collection.id,
        token: review.token,
      }),
    { code: 'STALE_REVIEW' },
  )
  review = operations.reviewCollectionRemoval(db, collection.id)
  operations.updateCollection(db, { id: collection.id, name: 'Changed' })
  assert.throws(
    () =>
      operations.removeCollection(db, {
        id: collection.id,
        token: review.token,
      }),
    { code: 'STALE_REVIEW' },
  )
  assert.throws(
    () => operations.removeCollection(db, { id: collection.id, token: '' }),
    { code: 'INVALID_INPUT' },
  )
  review = operations.reviewCollectionRemoval(db, collection.id)
  operations.removeCollection(db, { id: collection.id, token: review.token })
  assert.throws(() => operations.getCollection(db, collection.id), {
    code: 'NOT_FOUND',
  })
  assert.equal(db.select().from(collectionSamples).all().length, 0)
  assert.equal(db.select().from(samples).all().length, 3)
})

test('Collection removal schedules only unreferenced managed assets and rolls back scheduling failures', (t) => {
  const { db, native, close } = open()
  t.after(close)
  fixture(db)
  for (const reference of ['none', 'collection', 'pack', 'profile']) {
    const assetId = randomUUID()
    db.insert(imageAssets)
      .values({
        id: assetId,
        storageKey: `${assetId}.png`,
        mimeType: 'image/png',
        byteSize: 10,
        width: 1,
        height: 1,
      })
      .run()
    const collection = operations.createCollection(db, { name: reference })
    db.update(collections)
      .set({ coverAssetId: assetId })
      .where(eq(collections.id, collection.id))
      .run()
    if (reference === 'collection') {
      db.insert(collections)
        .values({ id: randomUUID(), name: 'Shared', coverAssetId: assetId })
        .run()
    } else if (reference === 'pack') {
      db.insert(packs)
        .values({
          id: randomUUID(),
          name: 'Shared',
          coverAssetId: assetId,
          sourceRootId: db.query.sourceRoots.findFirst().sync()!.id,
        })
        .run()
    } else if (reference === 'profile') {
      db.update(userProfiles).set({ avatarAssetId: assetId }).run()
    }
    const review = operations.reviewCollectionRemoval(db, collection.id)
    if (reference === 'none') {
      native.exec(
        `CREATE TEMP TRIGGER fail_cleanup BEFORE UPDATE ON image_assets BEGIN SELECT RAISE(ABORT, 'injected failure'); END`,
      )
      assert.throws(() =>
        operations.removeCollection(db, {
          id: collection.id,
          token: review.token,
        }),
      )
      assert.deepEqual(
        operations.getCollection(db, collection.id),
        review.entity,
      )
      native.exec('DROP TRIGGER fail_cleanup')
    }
    operations.removeCollection(db, { id: collection.id, token: review.token })
    assert.equal(
      db.select().from(imageAssets).where(eq(imageAssets.id, assetId)).get()!
        .state,
      reference === 'none' ? 'cleanup_pending' : 'ready',
    )
  }
})

test('Collection reads and impact inspection handle multiple bounded batches', (t) => {
  const { db, close } = open()
  t.after(close)
  const ids = fixture(db, 505)
  const collection = operations.createCollection(db, {
    name: 'Large selection',
  })
  ids.forEach((sampleId) =>
    operations.setCollectionMembership(db, {
      collectionId: collection.id,
      sampleId,
      assigned: true,
    }),
  )
  const review = operations.reviewCollectionRemoval(db, collection.id)
  assert.equal(review.sampleCount, 505)
  operations.reorderCollection(db, {
    collectionId: collection.id,
    sampleIds: ids.toReversed(),
  })
  assert.deepEqual(
    operations
      .listCollectionSamples(db, collection.id, { offset: 500 })
      .items.map((row) => row.sampleId),
    ids.slice(0, 5).reverse(),
  )
  assert.throws(
    () =>
      operations.removeCollection(db, {
        id: collection.id,
        token: review.token,
      }),
    { code: 'STALE_REVIEW' },
  )
})

test('Collection protocol rejects malformed requests and result envelopes', () => {
  const id = randomUUID()
  const entity = {
    id,
    name: 'Selection',
    description: null,
    coverAssetId: null,
  }
  assert.ok(
    isDbRequest({
      requestId: 1,
      action: 'create-collection',
      input: { name: 'Selection' },
    }),
  )
  assert.ok(
    isDbReply({ requestId: 1, action: 'get-collection', result: entity }),
  )
  for (const input of [
    null,
    {},
    { name: '\nName' },
    { name: 'Name', description: 1 },
  ]) {
    assert.equal(
      isDbRequest({ requestId: 1, action: 'create-collection', input }),
      false,
    )
  }
  assert.equal(
    isDbRequest({
      requestId: 1,
      action: 'reorder-collection',
      input: { collectionId: id, sampleIds: [id, id] },
    }),
    false,
  )
  for (const result of [
    { ...entity, name: ' Name ' },
    { ...entity, description: undefined },
    { ...entity, coverAssetId: 'bad' },
  ]) {
    assert.equal(
      isDbReply({ requestId: 1, action: 'get-collection', result }),
      false,
    )
  }
  assert.equal(
    isDbReply({
      requestId: 1,
      action: 'list-collections',
      result: { items: [entity], total: 0, limit: 50, offset: 0 },
    }),
    false,
  )
  assert.equal(
    isDbReply({
      requestId: 1,
      action: 'list-collection-samples',
      result: {
        items: [{ collectionId: id, sampleId: id, position: -1 }],
        total: 1,
        limit: 50,
        offset: 0,
      },
    }),
    false,
  )
  assert.equal(
    isDbReply({
      requestId: 1,
      action: 'review-collection-removal',
      result: { entity, sampleCount: 0, token: '' },
    }),
    false,
  )
})
