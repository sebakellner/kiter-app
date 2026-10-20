import { randomUUID } from 'node:crypto'
import { and, count, eq, gt, max, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../runtime/connection.ts'
import type {
  Collection,
  CollectionSummary,
  CollectionCreateRequest,
  CollectionUpdateRequest,
  CollectionPage,
  CollectionPageRequest,
  CollectionMembership,
  CollectionMembershipRequest,
  CollectionReorderRequest,
  CollectionDestination,
  CollectionDestinationsRequest,
  CollectionMembershipResult,
} from '../../../../shared/domain/collection.ts'
import {
  requireCollectionDescription,
  requireCollectionPage,
} from '../../../../shared/domain/collection.ts'
import {
  DomainValidationError,
  requireEntityId,
  requirePresentationName,
} from '../../../../shared/domain/validation.ts'
import { collections, collectionSamples } from '../../schema/collections.ts'
import { samples } from '../../schema/samples.ts'
import { DbError } from '../../errors.ts'
import {
  requireCollectionDestinationsRequest,
  requireCollectionMembershipRequest,
} from '../../../../shared/ipc/collections.ts'

const summaryFields = {
  id: collections.id,
  name: collections.name,
  description: collections.description,
  coverAssetId: collections.coverAssetId,
  sampleCount: sql<number>`(select count(*) from ${collectionSamples} where ${collectionSamples.collectionId} = ${collections.id})`,
}

export function getCollectionSummary(
  db: AppDatabase,
  id: string,
): CollectionSummary {
  requireEntityId(id)
  const row = db
    .select(summaryFields)
    .from(collections)
    .where(eq(collections.id, id))
    .get()
  if (!row) {
    throw new DbError('NOT_FOUND', 'The Collection no longer exists.')
  }
  return row
}

export function listCollectionSummaries(
  db: AppDatabase,
  input: CollectionPageRequest = {},
): CollectionPage<CollectionSummary> {
  const page = requireCollectionPage(input)
  return db.transaction(() => ({
    items: db
      .select(summaryFields)
      .from(collections)
      .orderBy(collections.name, collections.id)
      .limit(page.limit)
      .offset(page.offset)
      .all(),
    total: db.select({ count: count() }).from(collections).get()!.count,
    ...page,
  }))
}

export function listCollectionDestinations(
  db: AppDatabase,
  request: CollectionDestinationsRequest,
): CollectionPage<CollectionDestination> {
  const {
    sampleId,
    search = '',
    limit = 50,
    offset = 0,
  } = requireCollectionDestinationsRequest(request)
  return db.transaction(() => {
    if (
      !db
        .select({ id: samples.id })
        .from(samples)
        .where(eq(samples.id, sampleId))
        .get()
    ) {
      throw new DbError('NOT_FOUND', 'The Sample no longer exists.')
    }
    const filter = search
      ? sql`instr(kiter_search_text(${collections.name}), ${search}) > 0`
      : undefined
    const rows = db
      .select({
        ...summaryFields,
        assigned: sql<number>`exists (select 1 from ${collectionSamples} where ${collectionSamples.collectionId} = ${collections.id} and ${collectionSamples.sampleId} = ${sampleId})`,
      })
      .from(collections)
      .where(filter)
      .orderBy(collections.name, collections.id)
      .limit(limit)
      .offset(offset)
      .all()
    return {
      items: rows.map((row) => ({ ...row, assigned: Boolean(row.assigned) })),
      total: db
        .select({ total: count() })
        .from(collections)
        .where(filter)
        .get()!.total,
      limit,
      offset,
    }
  })
}

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
  return db.transaction(
    () => {
      const current = getCollection(db, input.id)
      if (
        input.expected &&
        (current.name !== input.expected.name ||
          current.description !== input.expected.description)
      ) {
        throw new DbError(
          'STALE_REVIEW',
          'The Collection changed. Reload saved details before saving again.',
        )
      }
      return db
        .update(collections)
        .set({ name, description })
        .where(eq(collections.id, input.id))
        .returning()
        .get()!
    },
    { behavior: 'immediate' },
  )
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
): CollectionMembershipResult {
  input = requireCollectionMembershipRequest(input)
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
      const existing = db.select().from(collectionSamples).where(filter).get()
      if (input.assigned) {
        if (!existing) {
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
      return {
        assigned: input.assigned,
        changed: Boolean(existing) !== input.assigned,
      }
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
