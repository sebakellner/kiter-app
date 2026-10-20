import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  lte,
  sql,
} from 'drizzle-orm'
import type { AppDatabase } from '../../runtime/connection.ts'
import { collectionSamples } from '../../schema/collections.ts'
import { createReviewHash } from '../../internal/review-token.ts'
import { DbError } from '../../errors.ts'
import { getCollection } from './operations.ts'
import {
  requireCollectionMoveRequest,
  requireCollectionPlaceRequest,
} from '../../../../shared/ipc/collections.ts'
import type {
  CollectionMoveRequest,
  CollectionMoveResult,
  CollectionPlaceRequest,
} from '../../../../shared/domain/collection.ts'

// The caller owns the consistent read/write transaction. Only bounded batches
// of identities and positions are read; the full sequence never leaves the worker.
export function getCollectionOrderToken(
  db: AppDatabase,
  collectionId: string,
): string {
  getCollection(db, collectionId)
  const hash = createReviewHash('collection-order-v1', collectionId)
  let after = -1
  for (;;) {
    const batch = db
      .select({
        sampleId: collectionSamples.sampleId,
        position: collectionSamples.position,
      })
      .from(collectionSamples)
      .where(
        and(
          eq(collectionSamples.collectionId, collectionId),
          gt(collectionSamples.position, after),
        ),
      )
      .orderBy(asc(collectionSamples.position))
      .limit(500)
      .all()
    for (const row of batch) {
      if (!Number.isSafeInteger(row.position)) {
        throw new DbError(
          'DB_INTEGRITY',
          'The Collection contains an invalid saved position.',
        )
      }
      hash.update(JSON.stringify([row.sampleId, row.position]) + '\n')
    }
    if (batch.length < 500) {
      break
    }
    after = batch[batch.length - 1].position
  }
  return hash.digest('hex')
}

function requireCurrentOrder(
  db: AppDatabase,
  collectionId: string,
  expected: string,
): string {
  const token = getCollectionOrderToken(db, collectionId)
  if (token !== expected) {
    throw new DbError(
      'STALE_REVIEW',
      'The Collection order changed. Refresh the Collection and repeat the move.',
    )
  }
  return token
}

function describeMove(
  db: AppDatabase,
  collectionId: string,
  sampleId: string,
  position: number,
  changed: boolean,
  token: string,
): CollectionMoveResult {
  const index = db
    .select({ value: count() })
    .from(collectionSamples)
    .where(
      and(
        eq(collectionSamples.collectionId, collectionId),
        lt(collectionSamples.position, position),
      ),
    )
    .get()!.value
  return {
    collectionId,
    sampleId,
    changed,
    index,
    orderToken: changed ? getCollectionOrderToken(db, collectionId) : token,
  }
}

export function moveCollectionSample(
  db: AppDatabase,
  input: CollectionMoveRequest,
): CollectionMoveResult {
  const request = requireCollectionMoveRequest(input)
  return db.transaction(
    () => {
      const token = requireCurrentOrder(db, request.collectionId, request.token)
      const filter = eq(collectionSamples.collectionId, request.collectionId)
      const current = db
        .select()
        .from(collectionSamples)
        .where(and(filter, eq(collectionSamples.sampleId, request.sampleId)))
        .get()
      if (!current) {
        throw new DbError(
          'NOT_FOUND',
          'The Sample no longer belongs to this Collection.',
        )
      }
      const neighbor = db
        .select()
        .from(collectionSamples)
        .where(
          and(
            filter,
            request.direction === 'up'
              ? lt(collectionSamples.position, current.position)
              : gt(collectionSamples.position, current.position),
          ),
        )
        .orderBy(
          request.direction === 'up'
            ? desc(collectionSamples.position)
            : asc(collectionSamples.position),
        )
        .limit(1)
        .get()
      if (neighbor) {
        // Reinsert just this pair to avoid transient unique-position conflicts.
        // The immediate transaction rolls both deletes/inserts back on failure.
        db.delete(collectionSamples)
          .where(
            and(
              filter,
              inArray(collectionSamples.sampleId, [
                current.sampleId,
                neighbor.sampleId,
              ]),
            ),
          )
          .run()
        db.insert(collectionSamples)
          .values([
            { ...current, position: neighbor.position },
            { ...neighbor, position: current.position },
          ])
          .run()
      }
      const position = neighbor?.position ?? current.position
      return describeMove(
        db,
        request.collectionId,
        request.sampleId,
        position,
        Boolean(neighbor),
        token,
      )
    },
    { behavior: 'immediate' },
  )
}

export function placeCollectionSample(
  db: AppDatabase,
  input: CollectionPlaceRequest,
): CollectionMoveResult {
  const request = requireCollectionPlaceRequest(input)
  return db.transaction(
    () => {
      const token = requireCurrentOrder(db, request.collectionId, request.token)
      const filter = eq(collectionSamples.collectionId, request.collectionId)
      const current = db
        .select()
        .from(collectionSamples)
        .where(and(filter, eq(collectionSamples.sampleId, request.sampleId)))
        .get()
      const target = db
        .select()
        .from(collectionSamples)
        .where(
          and(filter, eq(collectionSamples.sampleId, request.targetSampleId)),
        )
        .get()
      if (!current || !target) {
        throw new DbError(
          'NOT_FOUND',
          'The dragged Sample or drop destination no longer belongs to this Collection.',
        )
      }
      let destination = target.position
      if (current.sampleId === target.sampleId) {
        destination = current.position
      } else if (
        target.position < current.position &&
        request.placement === 'after'
      ) {
        destination = db
          .select({ position: collectionSamples.position })
          .from(collectionSamples)
          .where(and(filter, gt(collectionSamples.position, target.position)))
          .orderBy(asc(collectionSamples.position))
          .limit(1)
          .get()!.position
      } else if (
        target.position > current.position &&
        request.placement === 'before'
      ) {
        destination = db
          .select({ position: collectionSamples.position })
          .from(collectionSamples)
          .where(and(filter, lt(collectionSamples.position, target.position)))
          .orderBy(desc(collectionSamples.position))
          .limit(1)
          .get()!.position
      }
      if (destination === current.position) {
        return describeMove(
          db,
          request.collectionId,
          request.sampleId,
          current.position,
          false,
          token,
        )
      }

      const downward = destination > current.position
      db.delete(collectionSamples)
        .where(and(filter, eq(collectionSamples.sampleId, current.sampleId)))
        .run()
      const update = db
        .update(collectionSamples)
        .set({ position: sql`${sql.placeholder('position')}` })
        .where(
          and(
            filter,
            eq(collectionSamples.sampleId, sql.placeholder('sampleId')),
          ),
        )
        .prepare()
      let cursor = current.position
      let free = current.position
      for (;;) {
        const batch = db
          .select({
            sampleId: collectionSamples.sampleId,
            position: collectionSamples.position,
          })
          .from(collectionSamples)
          .where(
            and(
              filter,
              downward
                ? and(
                    gt(collectionSamples.position, cursor),
                    lte(collectionSamples.position, destination),
                  )
                : and(
                    lt(collectionSamples.position, cursor),
                    gte(collectionSamples.position, destination),
                  ),
            ),
          )
          .orderBy(
            downward
              ? asc(collectionSamples.position)
              : desc(collectionSamples.position),
          )
          .limit(500)
          .all()
        for (const row of batch) {
          update.run({ sampleId: row.sampleId, position: free })
          free = row.position
        }
        if (batch.length < 500) {
          break
        }
        cursor = batch[batch.length - 1].position
      }
      if (free !== destination) {
        throw new DbError(
          'DB_INTEGRITY',
          'The Collection drop destination could not be resolved.',
        )
      }
      db.insert(collectionSamples)
        .values({ ...current, position: destination })
        .run()
      return describeMove(
        db,
        request.collectionId,
        request.sampleId,
        destination,
        true,
        token,
      )
    },
    { behavior: 'immediate' },
  )
}
