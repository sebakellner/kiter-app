import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { test } from 'node:test'
import { eq } from 'drizzle-orm'
import {
  createDiskDatabase,
  createMemoryDatabase,
} from '../../../../../tests/support/database/connection.ts'
import { importSampleFixtures } from '../../../../../tests/support/database/import-samples.ts'
import { collectionSamples } from '../../schema/collections.ts'
import { samples, sampleSources } from '../../schema/samples.ts'
import { listCatalogSamples } from '../samples/catalog.ts'
import { setFavorite } from '../samples/favorites.ts'
import {
  createCollection,
  listCollectionSamples,
  reorderCollection,
  setCollectionMembership,
} from './operations.ts'
import { moveCollectionSample, placeCollectionSample } from './order.ts'

test('adjacent moves preserve gaps, unrelated data and other Collections, and boundaries are no-ops', (t) => {
  const { db } = createMemoryDatabase(t)
  const imported = importSampleFixtures(db, path.resolve('collection-order'), [
    'a.wav',
    'b.wav',
    'c.wav',
    'd.wav',
  ])
  const collection = createCollection(db, { name: 'Manual order' })
  const other = createCollection(db, { name: 'Other' })
  for (const sample of imported) {
    for (const collectionId of [collection.id, other.id]) {
      setCollectionMembership(db, {
        collectionId,
        sampleId: sample.id,
        assigned: true,
      })
    }
  }
  setCollectionMembership(db, {
    collectionId: collection.id,
    sampleId: imported[1].id,
    assigned: false,
  })
  const page = (): ReturnType<typeof listCatalogSamples> =>
    listCatalogSamples(db, { collectionId: collection.id })
  const beforeToken = page().collectionOrderToken!
  setFavorite(db, imported[2].id, true)
  assert.equal(page().collectionOrderToken, beforeToken)
  const beforeSamples = db.select().from(samples).all()
  const beforeSources = db.select().from(sampleSources).all()
  const beforeOther = listCollectionSamples(db, other.id)
  const moved = moveCollectionSample(db, {
    collectionId: collection.id,
    sampleId: imported[2].id,
    direction: 'up',
    token: beforeToken,
  })
  assert.equal(moved.changed, true)
  assert.equal(moved.index, 0)
  assert.notEqual(moved.orderToken, beforeToken)
  assert.deepEqual(
    listCollectionSamples(db, collection.id).items.map(
      ({ sampleId, position }) => [sampleId, position],
    ),
    [
      [imported[2].id, 0],
      [imported[0].id, 2],
      [imported[3].id, 3],
    ],
  )
  assert.deepEqual(
    moveCollectionSample(db, {
      collectionId: collection.id,
      sampleId: imported[2].id,
      direction: 'up',
      token: moved.orderToken,
    }),
    { ...moved, changed: false },
  )
  const end = moveCollectionSample(db, {
    collectionId: collection.id,
    sampleId: imported[3].id,
    direction: 'down',
    token: moved.orderToken,
  })
  assert.equal(end.changed, false)
  assert.equal(end.index, 2)
  assert.equal(end.orderToken, moved.orderToken)
  assert.deepEqual(db.select().from(samples).all(), beforeSamples)
  assert.deepEqual(db.select().from(sampleSources).all(), beforeSources)
  assert.deepEqual(listCollectionSamples(db, other.id), beforeOther)
  assert.deepEqual(
    page().items.map(({ id }) => id),
    [imported[2].id, imported[0].id, imported[3].id],
  )
})

test('drops insert before or after distant members, preserve gaps and make self or adjacent drops no-ops', (t) => {
  const { db } = createMemoryDatabase(t)
  const imported = importSampleFixtures(db, path.resolve('drop-order'), [
    'a.wav',
    'b.wav',
    'c.wav',
    'd.wav',
    'e.wav',
  ])
  const collection = createCollection(db, { name: 'Drops' })
  for (const sample of imported) {
    setCollectionMembership(db, {
      collectionId: collection.id,
      sampleId: sample.id,
      assigned: true,
    })
  }
  setCollectionMembership(db, {
    collectionId: collection.id,
    sampleId: imported[1].id,
    assigned: false,
  })
  const snapshot = db.select().from(samples).all()
  const read = (): ReturnType<typeof listCatalogSamples> =>
    listCatalogSamples(db, { collectionId: collection.id })
  const place = (
    source: number,
    target: number,
    placement: 'before' | 'after',
  ): ReturnType<typeof placeCollectionSample> =>
    placeCollectionSample(db, {
      collectionId: collection.id,
      sampleId: imported[source].id,
      targetSampleId: imported[target].id,
      placement,
      token: read().collectionOrderToken!,
    })
  assert.equal(place(4, 0, 'after').index, 1)
  assert.deepEqual(
    read().items.map(({ id }) => id),
    [0, 4, 2, 3].map((index) => imported[index].id),
  )
  assert.equal(place(0, 3, 'before').index, 2)
  assert.deepEqual(
    read().items.map(({ id }) => id),
    [4, 2, 0, 3].map((index) => imported[index].id),
  )
  assert.equal(place(3, 4, 'before').index, 0)
  assert.equal(place(4, 0, 'after').index, 3)
  assert.deepEqual(
    read().items.map(({ id }) => id),
    [3, 2, 0, 4].map((index) => imported[index].id),
  )
  const token = read().collectionOrderToken
  assert.equal(place(4, 4, 'before').changed, false)
  assert.equal(place(3, 2, 'before').changed, false)
  assert.equal(read().collectionOrderToken, token)
  assert.deepEqual(
    listCollectionSamples(db, collection.id).items.map(
      ({ position }) => position,
    ),
    [0, 2, 3, 4],
  )
  assert.deepEqual(db.select().from(samples).all(), snapshot)
  assert.throws(() => place(1, 3, 'before'), { code: 'NOT_FOUND' })
  assert.throws(
    () =>
      placeCollectionSample(db, {
        collectionId: collection.id,
        sampleId: imported[0].id,
        targetSampleId: randomUUID(),
        placement: 'after',
        token: token!,
      }),
    { code: 'NOT_FOUND' },
  )
})

test('long-distance drop rotations are bounded and late failures restore the exact saved sequence', (t) => {
  const { db, native } = createMemoryDatabase(t)
  const imported = importSampleFixtures(
    db,
    path.resolve('long-drop'),
    Array.from({ length: 1005 }, (_, index) => `${index}.wav`),
  )
  const collection = createCollection(db, { name: 'Long drops' })
  for (const sample of imported) {
    setCollectionMembership(db, {
      collectionId: collection.id,
      sampleId: sample.id,
      assigned: true,
    })
  }
  const token = listCatalogSamples(db, {
    collectionId: collection.id,
  }).collectionOrderToken!
  const request = {
    collectionId: collection.id,
    sampleId: imported[0].id,
    targetSampleId: imported.at(-1)!.id,
    placement: 'after' as const,
    token,
  }
  const result = placeCollectionSample(db, request)
  assert.equal(result.index, 1004)
  assert.equal(
    listCatalogSamples(db, {
      collectionId: collection.id,
      offset: 1000,
    }).items.at(-1)!.id,
    imported[0].id,
  )
  assert.throws(() => placeCollectionSample(db, request), {
    code: 'STALE_REVIEW',
  })
  const restored = placeCollectionSample(db, {
    ...request,
    targetSampleId: imported[1].id,
    placement: 'before',
    token: result.orderToken,
  })
  assert.equal(restored.index, 0)
  assert.equal(restored.orderToken, token)
  const before = db
    .select()
    .from(collectionSamples)
    .where(eq(collectionSamples.collectionId, collection.id))
    .orderBy(collectionSamples.position)
    .all()
  native.exec(
    `CREATE TRIGGER fail_drop BEFORE UPDATE OF position ON collection_samples WHEN NEW.sample_id = '${imported[2].id}' BEGIN SELECT RAISE(ABORT, 'injected drop failure'); END`,
  )
  assert.throws(() => placeCollectionSample(db, request))
  assert.deepEqual(
    db
      .select()
      .from(collectionSamples)
      .where(eq(collectionSamples.collectionId, collection.id))
      .orderBy(collectionSamples.position)
      .all(),
    before,
  )
  assert.equal(
    listCatalogSamples(db, { collectionId: collection.id })
      .collectionOrderToken,
    token,
  )
})

test('stale membership or ordering tokens reject without replaying the move, including equal-count changes', (t) => {
  const { db } = createMemoryDatabase(t)
  const imported = importSampleFixtures(db, path.resolve('stale-order'), [
    'a.wav',
    'b.wav',
    'c.wav',
  ])
  const collection = createCollection(db, { name: 'Picks' })
  for (const sample of imported) {
    setCollectionMembership(db, {
      collectionId: collection.id,
      sampleId: sample.id,
      assigned: true,
    })
  }
  const token = listCatalogSamples(db, {
    collectionId: collection.id,
  }).collectionOrderToken!
  const request = {
    collectionId: collection.id,
    sampleId: imported[0].id,
    direction: 'down' as const,
    token,
  }
  const moved = moveCollectionSample(db, request)
  const after = listCollectionSamples(db, collection.id)
  assert.throws(() => moveCollectionSample(db, request), {
    code: 'STALE_REVIEW',
  })
  assert.deepEqual(listCollectionSamples(db, collection.id), after)
  reorderCollection(db, {
    collectionId: collection.id,
    sampleIds: imported
      .slice()
      .reverse()
      .map(({ id }) => id),
  })
  assert.throws(
    () => moveCollectionSample(db, { ...request, token: moved.orderToken }),
    { code: 'STALE_REVIEW' },
  )
  const current = listCatalogSamples(db, {
    collectionId: collection.id,
  }).collectionOrderToken!
  setCollectionMembership(db, {
    collectionId: collection.id,
    sampleId: imported[2].id,
    assigned: false,
  })
  assert.throws(
    () => moveCollectionSample(db, { ...request, token: current }),
    { code: 'STALE_REVIEW' },
  )
  const valid = listCatalogSamples(db, {
    collectionId: collection.id,
  }).collectionOrderToken!
  assert.throws(
    () =>
      moveCollectionSample(db, {
        ...request,
        token: valid,
        sampleId: imported[2].id,
      }),
    { code: 'NOT_FOUND' },
  )
  assert.throws(
    () => moveCollectionSample(db, { ...request, collectionId: randomUUID() }),
    { code: 'NOT_FOUND' },
  )
})

test('a late swap failure atomically restores both memberships, positions and the previous token', (t) => {
  const { db, native } = createMemoryDatabase(t)
  const imported = importSampleFixtures(db, path.resolve('failed-order'), [
    'a.wav',
    'b.wav',
  ])
  const collection = createCollection(db, { name: 'Picks' })
  for (const sample of imported) {
    setCollectionMembership(db, {
      collectionId: collection.id,
      sampleId: sample.id,
      assigned: true,
    })
  }
  const before = listCollectionSamples(db, collection.id)
  const token = listCatalogSamples(db, {
    collectionId: collection.id,
  }).collectionOrderToken!
  native.exec(
    `CREATE TRIGGER fail_swap BEFORE INSERT ON collection_samples WHEN NEW.sample_id = '${imported[1].id}' BEGIN SELECT RAISE(ABORT, 'injected swap failure'); END`,
  )
  assert.throws(() =>
    moveCollectionSample(db, {
      collectionId: collection.id,
      sampleId: imported[0].id,
      direction: 'down',
      token,
    }),
  )
  assert.deepEqual(listCollectionSamples(db, collection.id), before)
  assert.equal(
    listCatalogSamples(db, { collectionId: collection.id })
      .collectionOrderToken,
    token,
  )
  assert.deepEqual(native.prepare('PRAGMA foreign_key_check').all(), [])
})

test('order tokens cover every membership across bounded batches and pages while move requests remain constant-sized', (t) => {
  const { db } = createMemoryDatabase(t)
  const imported = importSampleFixtures(
    db,
    path.resolve('paged-order'),
    Array.from({ length: 505 }, (_, index) => `${index}.wav`),
  )
  const collection = createCollection(db, { name: 'Many Samples' })
  for (const sample of imported) {
    setCollectionMembership(db, {
      collectionId: collection.id,
      sampleId: sample.id,
      assigned: true,
    })
  }
  const first = listCatalogSamples(db, {
    collectionId: collection.id,
    limit: 50,
  })
  const later = listCatalogSamples(db, {
    collectionId: collection.id,
    limit: 50,
    offset: 500,
  })
  assert.equal(first.collectionOrderToken, later.collectionOrderToken)
  assert.equal(first.items.length, 50)
  assert.equal(later.items.length, 5)
  assert.equal(
    listCatalogSamples(db, { collectionId: collection.id, search: '504' })
      .collectionOrderToken,
    first.collectionOrderToken,
  )
  const moved = moveCollectionSample(db, {
    collectionId: collection.id,
    sampleId: imported[499].id,
    direction: 'down',
    token: first.collectionOrderToken!,
  })
  assert.equal(moved.index, 500)
  const next = listCatalogSamples(db, {
    collectionId: collection.id,
    offset: 500,
    limit: 50,
  })
  assert.equal(next.items[0].id, imported[499].id)
  assert.equal(next.collectionOrderToken, moved.orderToken)
  const back = moveCollectionSample(db, {
    collectionId: collection.id,
    sampleId: imported[499].id,
    direction: 'up',
    token: moved.orderToken,
  })
  assert.equal(back.index, 499)
  assert.equal(back.orderToken, first.collectionOrderToken)
  assert.equal(listCatalogSamples(db, {}).collectionOrderToken, undefined)
})

test('manual order survives database reopen and invalid saved positions never produce a usable token', async (t) => {
  const disk = await createDiskDatabase(t)
  const { db } = disk.connection
  const imported = importSampleFixtures(
    db,
    path.join(disk.directory, 'samples'),
    ['a.wav', 'b.wav'],
  )
  const collection = createCollection(db, { name: 'Picks' })
  for (const sample of imported) {
    setCollectionMembership(db, {
      collectionId: collection.id,
      sampleId: sample.id,
      assigned: true,
    })
  }
  const token = listCatalogSamples(db, {
    collectionId: collection.id,
  }).collectionOrderToken!
  const saved = moveCollectionSample(db, {
    collectionId: collection.id,
    sampleId: imported[0].id,
    direction: 'down',
    token,
  })
  const reopened = disk.reopen()
  const page = listCatalogSamples(reopened.db, { collectionId: collection.id })
  assert.deepEqual(
    page.items.map(({ id }) => id),
    [imported[1].id, imported[0].id],
  )
  assert.equal(page.collectionOrderToken, saved.orderToken)
  reopened.db
    .update(collectionSamples)
    .set({ position: Number.MAX_SAFE_INTEGER + 1 })
    .where(eq(collectionSamples.sampleId, imported[0].id))
    .run()
  assert.throws(
    () => listCatalogSamples(reopened.db, { collectionId: collection.id }),
    { code: 'DB_INTEGRITY' },
  )
})
