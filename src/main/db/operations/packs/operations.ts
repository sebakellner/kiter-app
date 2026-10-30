import { randomUUID } from 'node:crypto'
import {
  createReviewHash,
  requireReviewToken,
} from '../../internal/review-token.ts'
import { basename, isAbsolute } from 'node:path'
import { and, count, eq, gt, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../runtime/connection.ts'
import type {
  Pack,
  PackUpdateRequest,
  PackPageRequest,
  PackPage,
  PackSample,
  PackImportCandidate,
  PackImportReview,
  PackImportRequest,
  SampleOrigin,
  SampleOriginRequest,
} from '../../../../shared/domain/pack.ts'
import { requirePackPage } from '../../../../shared/domain/pack.ts'
import { requireDescription } from '../../../../shared/domain/presentation.ts'
import type { PackListItem } from '../../../../shared/ipc/packs.ts'
import {
  DomainValidationError,
  requireEntityId,
  requirePresentationName,
} from '../../../../shared/domain/validation.ts'
import { packs } from '../../schema/packs.ts'
import {
  samples,
  sampleSources,
  sourceRootSamples,
} from '../../schema/samples.ts'
import { sourceRoots } from '../../schema/sources.ts'
import { DbError } from '../../errors.ts'

const originFields = {
  sampleId: samples.id,
  packId: samples.packId,
  originAssignment: samples.originAssignment,
}
const sampleFields = {
  ...originFields,
  name: sql<string>`coalesce(${samples.displayName}, ${sampleSources.canonicalPath})`,
  path: sampleSources.canonicalPath,
}
const packListFields = {
  id: packs.id,
  sourceRootId: packs.sourceRootId,
  name: packs.name,
  description: packs.description,
  coverAssetId: packs.coverAssetId,
  sourceRootPath: sourceRoots.canonicalPath,
}

export function getPackSourceRoot(
  db: AppDatabase,
  root: string,
): { id: string } {
  if (typeof root !== 'string' || !isAbsolute(root)) {
    throw new DomainValidationError('Invalid canonical source directory.')
  }
  const row = db
    .select({ id: sourceRoots.id })
    .from(sourceRoots)
    .where(eq(sourceRoots.canonicalPath, root))
    .get()
  if (!row) {
    throw new DbError(
      'NOT_FOUND',
      'Import the directory before registering a Pack.',
    )
  }
  return row
}

export function getPack(db: AppDatabase, id: string): Pack {
  requireEntityId(id)
  const row = db.select().from(packs).where(eq(packs.id, id)).get()
  if (!row) {
    throw new DbError('NOT_FOUND', 'The Pack no longer exists.')
  }
  return row
}

export function getPackSummary(db: AppDatabase, id: string): PackListItem {
  requireEntityId(id)
  const row = db
    .select(packListFields)
    .from(packs)
    .innerJoin(sourceRoots, eq(sourceRoots.id, packs.sourceRootId))
    .where(eq(packs.id, id))
    .get()
  if (!row) {
    throw new DbError('NOT_FOUND', 'The Pack no longer exists.')
  }
  return row
}

export function updatePack(db: AppDatabase, input: PackUpdateRequest): Pack {
  requireEntityId(input.id)
  const name = requirePresentationName(input.name)
  const description = requireDescription(input.description)
  const row = db
    .update(packs)
    .set({ name, description })
    .where(eq(packs.id, input.id))
    .returning()
    .get()
  if (!row) {
    throw new DbError('NOT_FOUND', 'The Pack no longer exists.')
  }
  return row
}

export function listPacks(
  db: AppDatabase,
  input: PackPageRequest = {},
): PackPage<PackListItem> {
  const page = requirePackPage(input)
  return db.transaction(() => ({
    // One joined page: the root path names the Pack's source context.
    items: db
      .select(packListFields)
      .from(packs)
      .innerJoin(sourceRoots, eq(sourceRoots.id, packs.sourceRootId))
      .orderBy(packs.name, packs.id)
      .limit(page.limit)
      .offset(page.offset)
      .all(),
    total: db.select({ count: count() }).from(packs).get()!.count,
    ...page,
  }))
}

export function listPackSamples(
  db: AppDatabase,
  id: string,
  input: PackPageRequest = {},
): PackPage<PackSample> {
  const page = requirePackPage(input)
  return db.transaction(() => {
    getPack(db, id)
    const filter = eq(samples.packId, id)
    return {
      items: db
        .select(sampleFields)
        .from(samples)
        .innerJoin(sampleSources, eq(samples.id, sampleSources.sampleId))
        .where(filter)
        .orderBy(sampleSources.canonicalPath, samples.id)
        .limit(page.limit)
        .offset(page.offset)
        .all()
        .map((row) => ({
          ...row,
          name: row.name === row.path ? basename(row.path) : row.name,
        })),
      total: db.select({ count: count() }).from(samples).where(filter).get()!
        .count,
      ...page,
    }
  })
}

export function getSampleOrigin(
  db: AppDatabase,
  sampleId: string,
): SampleOrigin {
  requireEntityId(sampleId)
  const row = db
    .select(originFields)
    .from(samples)
    .where(eq(samples.id, sampleId))
    .get()
  if (!row) {
    throw new DbError('NOT_FOUND', 'The Sample no longer exists.')
  }
  return row
}

export function setSampleOrigin(
  db: AppDatabase,
  input: SampleOriginRequest,
): SampleOrigin {
  requireEntityId(input.sampleId)
  if (input.packId !== null) {
    requireEntityId(input.packId)
  }
  return db.transaction(
    () => {
      getSampleOrigin(db, input.sampleId)
      if (input.packId !== null) {
        getPack(db, input.packId)
      }
      db.update(samples)
        .set({ packId: input.packId, originAssignment: 'manual' })
        .where(eq(samples.id, input.sampleId))
        .run()
      return getSampleOrigin(db, input.sampleId)
    },
    { behavior: 'immediate' },
  )
}

function importContext(
  db: AppDatabase,
  sourceRootId: string,
): { root: typeof sourceRoots.$inferSelect; pack: Pack | null } {
  requireEntityId(sourceRootId)
  const root = db
    .select()
    .from(sourceRoots)
    .where(eq(sourceRoots.id, sourceRootId))
    .get()
  if (!root) {
    throw new DbError('NOT_FOUND', 'The source directory no longer exists.')
  }
  if (!root.registered || root.lastScanOutcome !== 'completed') {
    throw new DomainValidationError(
      'Scan the registered directory before importing a Pack.',
    )
  }
  const pack =
    db.select().from(packs).where(eq(packs.sourceRootId, sourceRootId)).get() ??
    null
  return { root, pack }
}

function isConflict(row: SampleOrigin, pack: Pack | null): boolean {
  return (
    row.packId !== pack?.id &&
    (row.packId !== null || row.originAssignment === 'manual')
  )
}

function candidateRows(
  db: AppDatabase,
  sourceRootId: string,
  after = '',
  limit = 500,
  offset = 0,
): (PackSample & { revision: number })[] {
  return db
    .select({ ...sampleFields, revision: sampleSources.revision })
    .from(sourceRootSamples)
    .innerJoin(samples, eq(samples.id, sourceRootSamples.sampleId))
    .innerJoin(sampleSources, eq(samples.id, sampleSources.sampleId))
    .where(
      and(
        eq(sourceRootSamples.sourceRootId, sourceRootId),
        eq(sourceRootSamples.present, true),
        gt(samples.id, after),
      ),
    )
    .orderBy(samples.id)
    .limit(limit)
    .offset(offset)
    .all()
}

export function listPackImportCandidates(
  db: AppDatabase,
  sourceRootId: string,
  input: PackPageRequest = {},
): PackPage<PackImportCandidate> {
  const page = requirePackPage(input)
  return db.transaction(() => {
    const { pack } = importContext(db, sourceRootId)
    const items = candidateRows(
      db,
      sourceRootId,
      '',
      page.limit,
      page.offset,
    ).map((row) => ({
      sampleId: row.sampleId,
      packId: row.packId,
      originAssignment: row.originAssignment,
      name: row.name === row.path ? basename(row.path) : row.name,
      path: row.path,
      conflict: isConflict(row, pack),
    }))
    const total = db
      .select({ count: count() })
      .from(sourceRootSamples)
      .where(
        and(
          eq(sourceRootSamples.sourceRootId, sourceRootId),
          eq(sourceRootSamples.present, true),
        ),
      )
      .get()!.count
    return { items, total, ...page }
  })
}

function importReview(db: AppDatabase, sourceRootId: string): PackImportReview {
  const { root, pack } = importContext(db, sourceRootId)
  const hash = createReviewHash('pack-import', root, pack)
  let after = '',
    sampleCount = 0,
    conflictCount = 0
  for (;;) {
    const batch = candidateRows(db, sourceRootId, after)
    for (const row of batch) {
      hash.update(JSON.stringify(row))
      sampleCount++
      if (isConflict(row, pack)) {
        conflictCount++
      }
    }
    if (batch.length < 500) {
      break
    }
    after = batch[batch.length - 1].sampleId
  }
  return {
    sourceRootId,
    pack,
    sampleCount,
    conflictCount,
    token: hash.digest('hex'),
  }
}

export function reviewPackImport(
  db: AppDatabase,
  sourceRootId: string,
): PackImportReview {
  return db.transaction(() => importReview(db, sourceRootId))
}

export function importPack(db: AppDatabase, input: PackImportRequest): Pack {
  requireReviewToken(input.token, 'A review token is required.')
  const name = requirePresentationName(input.name)
  const description = requireDescription(input.description)
  if (!Array.isArray(input.decisions)) {
    throw new DomainValidationError('Explicit conflict decisions are required.')
  }
  const decisions = new Map<string, 'keep' | 'assign'>()
  for (const decision of input.decisions) {
    requireEntityId(decision.sampleId)
    if (
      !['keep', 'assign'].includes(decision.resolution) ||
      decisions.has(decision.sampleId)
    ) {
      throw new DomainValidationError('Invalid or repeated conflict decision.')
    }
    decisions.set(decision.sampleId, decision.resolution)
  }
  return db.transaction(
    () => {
      const review = importReview(db, input.sourceRootId)
      if (review.token !== input.token) {
        throw new DbError(
          'STALE_REVIEW',
          'Pack import changed. Review the origins again.',
        )
      }
      const entity = review.pack ?? {
        id: randomUUID(),
        sourceRootId: input.sourceRootId,
        name,
        description,
        coverAssetId: null,
      }
      if (!review.pack) {
        db.insert(packs).values(entity).run()
      }
      let after = '',
        conflictCount = 0
      for (;;) {
        const batch = candidateRows(db, input.sourceRootId, after)
        for (const row of batch) {
          const conflict = isConflict(row, review.pack)
          const decision = decisions.get(row.sampleId)
          if (conflict) {
            conflictCount++
            if (!decision) {
              throw new DomainValidationError(
                'Every origin conflict requires an explicit decision.',
              )
            }
          } else if (decision) {
            throw new DomainValidationError(
              'Decisions must refer only to reviewed origin conflicts.',
            )
          }
          if (conflict && decision === 'keep') {
            continue
          }
          if (row.packId !== entity.id) {
            db.update(samples)
              .set({
                packId: entity.id,
                originAssignment: conflict ? 'manual' : 'automatic',
              })
              .where(eq(samples.id, row.sampleId))
              .run()
          }
        }
        if (batch.length < 500) {
          break
        }
        after = batch[batch.length - 1].sampleId
      }
      if (decisions.size !== conflictCount) {
        throw new DomainValidationError(
          'Decisions must match the reviewed conflicts exactly.',
        )
      }
      if (
        !review.pack &&
        !db
          .select({ id: samples.id })
          .from(samples)
          .where(eq(samples.packId, entity.id))
          .get()
      ) {
        throw new DomainValidationError(
          'A new Pack requires at least one associated Sample.',
        )
      }
      return entity
    },
    { behavior: 'immediate' },
  )
}
