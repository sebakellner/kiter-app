import { createHash, randomUUID } from 'node:crypto'
import { and, count, eq, gt, max, sql } from 'drizzle-orm'
import type { AppDatabase } from '../connection.ts'
import type {
  Collection,
  CollectionCreateRequest,
  CollectionUpdateRequest,
  CollectionPage,
  CollectionPageRequest,
  CollectionMembership,
  CollectionMembershipRequest,
  CollectionReorderRequest,
  CollectionRemovalReview,
  CollectionRemovalRequest,
} from '../../../shared/domain/collection.ts'
import {
  requireCollectionDescription,
  requireCollectionPage,
} from '../../../shared/domain/collection.ts'
import {
  DomainValidationError,
  requireEntityId,
  requirePresentationName,
} from '../../../shared/domain/validation.ts'
import { collections, collectionSamples } from '../schema/collections.ts'
import { samples } from '../schema/samples.ts'
import { packs } from '../schema/packs.ts'
import { userProfiles } from '../schema/profile.ts'
import { imageAssets } from '../schema/assets.ts'
import { DbError } from '../errors.ts'

export function getCollection(db: AppDatabase, id: string): Collection {
  requireEntityId(id)
  const row = db.select().from(collections).where(eq(collections.id, id)).get()
  if (!row) {
    throw new DbError('NOT_FOUND', 'The Collection no longer exists.')
  }
  return row
}

export function createCollection(
  db: AppDatabase,
  input: CollectionCreateRequest,
): Collection {
  const entity = {
    id: randomUUID(),
    name: requirePresentationName(input.name),
    description: requireCollectionDescription(input.description),
    coverAssetId: null,
  }
  db.insert(collections).values(entity).run()
  return entity
}

export function updateCollection(
  db: AppDatabase,
  input: CollectionUpdateRequest,
): Collection {
  requireEntityId(input.id)
  const name = requirePresentationName(input.name)
  const description = requireCollectionDescription(input.description)
  const row = db
    .update(collections)
    .set({ name, description })
    .where(eq(collections.id, input.id))
    .returning()
    .get()
  if (!row) {
    throw new DbError('NOT_FOUND', 'The Collection no longer exists.')
  }
  return row
}

export function listCollections(
  db: AppDatabase,
  input: CollectionPageRequest = {},
): CollectionPage<Collection> {
  const page = requireCollectionPage(input)
  return db.transaction(() => ({
    items: db
      .select()
      .from(collections)
      .orderBy(collections.name, collections.id)
      .limit(page.limit)
      .offset(page.offset)
      .all(),
    total: db.select({ count: count() }).from(collections).get()!.count,
    ...page,
  }))
}

export function listCollectionSamples(
  db: AppDatabase,
  id: string,
  input: CollectionPageRequest = {},
): CollectionPage<CollectionMembership> {
  const page = requireCollectionPage(input)
  return db.transaction(() => {
    getCollection(db, id)
    const filter = eq(collectionSamples.collectionId, id)
    return {
      items: db
        .select()
        .from(collectionSamples)
        .where(filter)
        .orderBy(collectionSamples.position)
        .limit(page.limit)
        .offset(page.offset)
        .all(),
      total: db
        .select({ count: count() })
        .from(collectionSamples)
        .where(filter)
        .get()!.count,
      ...page,
    }
  })
}

export function setCollectionMembership(
  db: AppDatabase,
  input: CollectionMembershipRequest,
): { assigned: boolean } {
  requireEntityId(input.collectionId)
  requireEntityId(input.sampleId)
  if (typeof input.assigned !== 'boolean') {
    throw new DomainValidationError('Invalid membership state.')
  }
  return db.transaction(
    () => {
      getCollection(db, input.collectionId)
      if (
        !db
          .select({ id: samples.id })
          .from(samples)
          .where(eq(samples.id, input.sampleId))
          .get()
      ) {
        throw new DbError('NOT_FOUND', 'The Sample no longer exists.')
      }
      const filter = and(
        eq(collectionSamples.collectionId, input.collectionId),
        eq(collectionSamples.sampleId, input.sampleId),
      )
      if (input.assigned) {
        if (!db.select().from(collectionSamples).where(filter).get()) {
          const last = db
            .select({ position: max(collectionSamples.position) })
            .from(collectionSamples)
            .where(eq(collectionSamples.collectionId, input.collectionId))
            .get()!.position
          const position = (last ?? -1) + 1
          if (!Number.isSafeInteger(position)) {
            throw new DomainValidationError(
              'Reorder this Collection before adding more Samples.',
            )
          }
          db.insert(collectionSamples)
            .values({
              collectionId: input.collectionId,
              sampleId: input.sampleId,
              position,
            })
            .run()
        }
      } else {
        db.delete(collectionSamples).where(filter).run()
      }
      return { assigned: input.assigned }
    },
    { behavior: 'immediate' },
  )
}

export function reorderCollection(
  db: AppDatabase,
  input: CollectionReorderRequest,
): { id: string } {
  requireEntityId(input.collectionId)
  if (!Array.isArray(input.sampleIds)) {
    throw new DomainValidationError('A complete Sample sequence is required.')
  }
  for (const id of input.sampleIds) {
    requireEntityId(id)
  }
  const requested = new Set(input.sampleIds)
  if (requested.size !== input.sampleIds.length) {
    throw new DomainValidationError('Collection Samples must not repeat.')
  }
  return db.transaction(
    () => {
      getCollection(db, input.collectionId)
      // Read memberships in bounded batches; the command itself supplies the full sequence.
      let after = '',
        total = 0
      for (;;) {
        const batch = db
          .select({ id: collectionSamples.sampleId })
          .from(collectionSamples)
          .where(
            and(
              eq(collectionSamples.collectionId, input.collectionId),
              gt(collectionSamples.sampleId, after),
            ),
          )
          .orderBy(collectionSamples.sampleId)
          .limit(500)
          .all()
        for (const row of batch) {
          if (!requested.has(row.id)) {
            throw new DomainValidationError(
              'The sequence must contain every current Collection Sample exactly once.',
            )
          }
        }
        total += batch.length
        if (batch.length < 500) {
          break
        }
        after = batch[batch.length - 1].id
      }
      if (total !== requested.size) {
        throw new DomainValidationError(
          'The sequence must contain every current Collection Sample exactly once.',
        )
      }
      // Reinsert inside the transaction to avoid transient unique-position collisions.
      db.delete(collectionSamples)
        .where(eq(collectionSamples.collectionId, input.collectionId))
        .run()
      const insert = db
        .insert(collectionSamples)
        .values({
          collectionId: input.collectionId,
          sampleId: sql.placeholder('sampleId'),
          position: sql.placeholder('position'),
        })
        .prepare()
      input.sampleIds.forEach((sampleId, position) =>
        insert.run({ sampleId, position }),
      )
      return { id: input.collectionId }
    },
    { behavior: 'immediate' },
  )
}

function removalReview(db: AppDatabase, id: string): CollectionRemovalReview {
  const entity = getCollection(db, id)
  const hash = createHash('sha256').update(
    JSON.stringify(['collection', entity]),
  )
  let after = '',
    sampleCount = 0
  for (;;) {
    const batch = db
      .select()
      .from(collectionSamples)
      .where(
        and(
          eq(collectionSamples.collectionId, id),
          gt(collectionSamples.sampleId, after),
        ),
      )
      .orderBy(collectionSamples.sampleId)
      .limit(500)
      .all()
    for (const row of batch) {
      hash.update(JSON.stringify([row.sampleId, row.position]))
    }
    sampleCount += batch.length
    if (batch.length < 500) {
      break
    }
    after = batch[batch.length - 1].sampleId
  }
  return { entity, sampleCount, token: hash.digest('hex') }
}

export function reviewCollectionRemoval(
  db: AppDatabase,
  id: string,
): CollectionRemovalReview {
  return db.transaction(() => removalReview(db, id))
}

export function removeCollection(
  db: AppDatabase,
  input: CollectionRemovalRequest,
): { id: string } {
  requireEntityId(input.id)
  if (typeof input.token !== 'string' || !/^[a-f0-9]{64}$/.test(input.token)) {
    throw new DomainValidationError('A removal review token is required.')
  }
  return db.transaction(
    () => {
      const review = removalReview(db, input.id)
      if (review.token !== input.token) {
        throw new DbError(
          'STALE_REVIEW',
          'The Collection changed. Review it again before removing.',
        )
      }
      db.delete(collections).where(eq(collections.id, input.id)).run()
      const assetId = review.entity.coverAssetId
      if (assetId !== null) {
        db.update(imageAssets)
          .set({ state: 'cleanup_pending' })
          .where(
            and(
              eq(imageAssets.id, assetId),
              sql`not exists (select 1 from ${collections} where ${collections.coverAssetId} = ${assetId})`,
              sql`not exists (select 1 from ${packs} where ${packs.coverAssetId} = ${assetId})`,
              sql`not exists (select 1 from ${userProfiles} where ${userProfiles.avatarAssetId} = ${assetId})`,
            ),
          )
          .run()
      }
      return { id: input.id }
    },
    { behavior: 'immediate' },
  )
}
