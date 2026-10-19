import { randomUUID } from 'node:crypto'
import {
  createReviewHash,
  requireReviewToken,
} from '../../internal/review-token.ts'
import { basename } from 'node:path'
import { and, asc, count, eq, gt, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../runtime/connection.ts'
import {
  requireClassificationName,
  requireClassificationPage,
  normalizeName,
  isClassificationTarget,
} from '../../../../shared/domain/classification.ts'
import type {
  Author,
  Instrument,
  ClassificationPage,
  ClassificationPageRequest,
  ClassificationAssignmentRequest,
  ClassificationTarget,
  ClassificationRemovalReview,
  ClassificationRemovalRequest,
  ClassificationUsesRequest,
  ClassificationUse,
} from '../../../../shared/domain/classification.ts'
import {
  requireEntityId,
  DomainValidationError,
} from '../../../../shared/domain/validation.ts'
import {
  authors,
  instruments,
  sampleAuthors,
  packAuthors,
  sampleInstruments,
  packInstruments,
} from '../../schema/classification.ts'
import { samples, sampleSources } from '../../schema/samples.ts'
import { packs } from '../../schema/packs.ts'
import { userProfiles } from '../../schema/profile.ts'
import { DbError } from '../../errors.ts'
import {
  registerVocabularyEntity,
  requireRecognitionNameAvailable,
  retireVocabularyEntity,
} from './vocabulary.ts'
import {
  recognitionVocabulary,
  recognitionAliases,
} from '../../schema/recognition.ts'

function requireTarget(target: ClassificationTarget): void {
  if (!isClassificationTarget(target)) {
    throw new DomainValidationError('Invalid classification target.')
  }
}

function requireExistingTarget(
  db: AppDatabase,
  target: ClassificationTarget,
): void {
  requireTarget(target)
  const table = target.kind === 'sample' ? samples : packs
  if (
    !db
      .select({ id: table.id })
      .from(table)
      .where(eq(table.id, target.id))
      .get()
  ) {
    throw new DbError(
      'NOT_FOUND',
      'The classification target no longer exists.',
    )
  }
}

export function getAuthor(db: AppDatabase, id: string): Author {
  requireEntityId(id)
  const row = db
    .select({ id: authors.id, name: authors.name })
    .from(authors)
    .where(eq(authors.id, id))
    .get()
  if (!row) {
    throw new DbError('NOT_FOUND', 'The Author no longer exists.')
  }
  return row
}

export function getInstrument(db: AppDatabase, id: string): Instrument {
  requireEntityId(id)
  const row = db
    .select({ id: instruments.id, name: instruments.name })
    .from(instruments)
    .where(eq(instruments.id, id))
    .get()
  if (!row) {
    throw new DbError('NOT_FOUND', 'The Instrument no longer exists.')
  }
  return row
}

export function createAuthor(db: AppDatabase, input: { name: string }): Author {
  const name = requireClassificationName(input.name)
  const entity = { id: randomUUID(), name }
  db.insert(authors)
    .values({ ...entity, nameKey: normalizeName(name) })
    .run()
  return entity
}

export function renameAuthor(
  db: AppDatabase,
  input: { id: string; name: string },
): Author {
  requireEntityId(input.id)
  const name = requireClassificationName(input.name)
  const row = db
    .update(authors)
    .set({ name, nameKey: normalizeName(name) })
    .where(eq(authors.id, input.id))
    .returning({ id: authors.id, name: authors.name })
    .get()
  if (!row) {
    throw new DbError('NOT_FOUND', 'The Author no longer exists.')
  }
  return row
}

function requireUniqueInstrument(
  db: AppDatabase,
  nameKey: string,
  ownId?: string,
): void {
  const existing = db
    .select({ id: instruments.id })
    .from(instruments)
    .where(eq(instruments.nameKey, nameKey))
    .get()
  if (existing && existing.id !== ownId) {
    throw new DbError(
      'NAME_CONFLICT',
      'An Instrument with this name already exists.',
    )
  }
}

export function createInstrument(
  db: AppDatabase,
  input: { name: string },
): Instrument {
  const name = requireClassificationName(input.name)
  const nameKey = normalizeName(name)
  return db.transaction(
    () => {
      requireUniqueInstrument(db, nameKey)
      const offered = db
        .select()
        .from(recognitionVocabulary)
        .where(eq(recognitionVocabulary.dimension, 'instrument'))
        .all()
        .find(
          (row) =>
            row.instrumentId === null &&
            row.state !== 'deleted' &&
            normalizeName(row.name) === nameKey,
        )
      requireRecognitionNameAvailable(db, 'instrument', name, offered?.key)
      const entity = { id: randomUUID(), name }
      db.insert(instruments)
        .values({ ...entity, nameKey })
        .run()
      registerVocabularyEntity(db, 'instrument', entity)
      return entity
    },
    { behavior: 'immediate' },
  )
}

export function renameInstrument(
  db: AppDatabase,
  input: { id: string; name: string },
): Instrument {
  requireEntityId(input.id)
  const name = requireClassificationName(input.name)
  const nameKey = normalizeName(name)
  return db.transaction(
    () => {
      getInstrument(db, input.id)
      requireUniqueInstrument(db, nameKey, input.id)
      const vocabulary = db
        .select()
        .from(recognitionVocabulary)
        .where(eq(recognitionVocabulary.instrumentId, input.id))
        .get()
      requireRecognitionNameAvailable(db, 'instrument', name, vocabulary?.key)
      db.update(instruments)
        .set({ name, nameKey })
        .where(eq(instruments.id, input.id))
        .run()
      if (vocabulary) {
        db.update(recognitionVocabulary)
          .set({ name })
          .where(eq(recognitionVocabulary.key, vocabulary.key))
          .run()
      }
      return { id: input.id, name }
    },
    { behavior: 'immediate' },
  )
}

export function listAuthors(
  db: AppDatabase,
  input: ClassificationPageRequest = {},
): ClassificationPage<Author> {
  const page = requireClassificationPage(input)
  const filter = sql`instr(${authors.nameKey}, ${page.search}) > 0`
  return db.transaction(() => ({
    items: db
      .select({ id: authors.id, name: authors.name })
      .from(authors)
      .where(filter)
      .orderBy(asc(authors.nameKey), asc(authors.id))
      .limit(page.limit)
      .offset(page.offset)
      .all(),
    total: db.select({ count: count() }).from(authors).where(filter).get()!
      .count,
    limit: page.limit,
    offset: page.offset,
  }))
}

export function listInstruments(
  db: AppDatabase,
  input: ClassificationPageRequest = {},
): ClassificationPage<Instrument> {
  const page = requireClassificationPage(input)
  const filter = sql`instr(${instruments.nameKey}, ${page.search}) > 0`
  return db.transaction(() => ({
    items: db
      .select({ id: instruments.id, name: instruments.name })
      .from(instruments)
      .where(filter)
      .orderBy(asc(instruments.nameKey), asc(instruments.id))
      .limit(page.limit)
      .offset(page.offset)
      .all(),
    total: db.select({ count: count() }).from(instruments).where(filter).get()!
      .count,
    limit: page.limit,
    offset: page.offset,
  }))
}

export function setAuthorAssignment(
  db: AppDatabase,
  input: ClassificationAssignmentRequest,
): { assigned: boolean } {
  requireEntityId(input.id)
  requireTarget(input.target)
  if (typeof input.assigned !== 'boolean') {
    throw new DomainValidationError('Invalid assignment state.')
  }
  return db.transaction(
    () => {
      getAuthor(db, input.id)
      requireExistingTarget(db, input.target)
      if (input.target.kind === 'sample') {
        if (input.assigned) {
          db.insert(sampleAuthors)
            .values({ sampleId: input.target.id, authorId: input.id })
            .onConflictDoNothing()
            .run()
        } else {
          db.delete(sampleAuthors)
            .where(
              and(
                eq(sampleAuthors.sampleId, input.target.id),
                eq(sampleAuthors.authorId, input.id),
              ),
            )
            .run()
        }
      } else {
        if (input.assigned) {
          db.insert(packAuthors)
            .values({ packId: input.target.id, authorId: input.id })
            .onConflictDoNothing()
            .run()
        } else {
          db.delete(packAuthors)
            .where(
              and(
                eq(packAuthors.packId, input.target.id),
                eq(packAuthors.authorId, input.id),
              ),
            )
            .run()
        }
      }
      return { assigned: input.assigned }
    },
    { behavior: 'immediate' },
  )
}

export function setInstrumentAssignment(
  db: AppDatabase,
  input: ClassificationAssignmentRequest,
): { assigned: boolean } {
  requireEntityId(input.id)
  requireTarget(input.target)
  if (typeof input.assigned !== 'boolean') {
    throw new DomainValidationError('Invalid assignment state.')
  }
  return db.transaction(
    () => {
      getInstrument(db, input.id)
      requireExistingTarget(db, input.target)
      if (input.target.kind === 'sample') {
        if (input.assigned) {
          db.insert(sampleInstruments)
            .values({ sampleId: input.target.id, instrumentId: input.id })
            .onConflictDoNothing()
            .run()
        } else {
          db.delete(sampleInstruments)
            .where(
              and(
                eq(sampleInstruments.sampleId, input.target.id),
                eq(sampleInstruments.instrumentId, input.id),
              ),
            )
            .run()
        }
      } else {
        if (input.assigned) {
          db.insert(packInstruments)
            .values({ packId: input.target.id, instrumentId: input.id })
            .onConflictDoNothing()
            .run()
        } else {
          db.delete(packInstruments)
            .where(
              and(
                eq(packInstruments.packId, input.target.id),
                eq(packInstruments.instrumentId, input.id),
              ),
            )
            .run()
        }
      }
      return { assigned: input.assigned }
    },
    { behavior: 'immediate' },
  )
}

export function listTargetAuthors(
  db: AppDatabase,
  target: ClassificationTarget,
  input: ClassificationPageRequest = {},
): ClassificationPage<Author> {
  requireTarget(target)
  const page = requireClassificationPage(input)
  return db.transaction(() => {
    requireExistingTarget(db, target)
    const assigned =
      target.kind === 'sample'
        ? sql`exists (select 1 from ${sampleAuthors} where ${sampleAuthors.authorId} = ${authors.id} and ${sampleAuthors.sampleId} = ${target.id})`
        : sql`exists (select 1 from ${packAuthors} where ${packAuthors.authorId} = ${authors.id} and ${packAuthors.packId} = ${target.id})`
    const filter = and(
      assigned,
      sql`instr(${authors.nameKey}, ${page.search}) > 0`,
    )
    return {
      items: db
        .select({ id: authors.id, name: authors.name })
        .from(authors)
        .where(filter)
        .orderBy(authors.nameKey, authors.id)
        .limit(page.limit)
        .offset(page.offset)
        .all(),
      total: db.select({ count: count() }).from(authors).where(filter).get()!
        .count,
      limit: page.limit,
      offset: page.offset,
    }
  })
}

export function listTargetInstruments(
  db: AppDatabase,
  target: ClassificationTarget,
  input: ClassificationPageRequest = {},
): ClassificationPage<Instrument> {
  requireTarget(target)
  const page = requireClassificationPage(input)
  return db.transaction(() => {
    requireExistingTarget(db, target)
    const assigned =
      target.kind === 'sample'
        ? sql`exists (select 1 from ${sampleInstruments} where ${sampleInstruments.instrumentId} = ${instruments.id} and ${sampleInstruments.sampleId} = ${target.id})`
        : sql`exists (select 1 from ${packInstruments} where ${packInstruments.instrumentId} = ${instruments.id} and ${packInstruments.packId} = ${target.id})`
    const filter = and(
      assigned,
      sql`instr(${instruments.nameKey}, ${page.search}) > 0`,
    )
    return {
      items: db
        .select({ id: instruments.id, name: instruments.name })
        .from(instruments)
        .where(filter)
        .orderBy(instruments.nameKey, instruments.id)
        .limit(page.limit)
        .offset(page.offset)
        .all(),
      total: db
        .select({ count: count() })
        .from(instruments)
        .where(filter)
        .get()!.count,
      limit: page.limit,
      offset: page.offset,
    }
  })
}

function listUses(
  db: AppDatabase,
  input: ClassificationUsesRequest,
  kind: 'author' | 'instrument',
): ClassificationPage<ClassificationUse> {
  requireEntityId(input.id)
  const page = requireClassificationPage(input)
  if (input.kind !== 'sample' && input.kind !== 'pack') {
    throw new DomainValidationError('Invalid use kind.')
  }
  return db.transaction(() => {
    if (kind === 'author') {
      getAuthor(db, input.id)
    } else {
      getInstrument(db, input.id)
    }
    if (input.kind === 'pack') {
      const filter =
        kind === 'author'
          ? sql`exists (select 1 from ${packAuthors} where ${packAuthors.packId} = ${packs.id} and ${packAuthors.authorId} = ${input.id})`
          : sql`exists (select 1 from ${packInstruments} where ${packInstruments.packId} = ${packs.id} and ${packInstruments.instrumentId} = ${input.id})`
      return {
        items: db
          .select({ id: packs.id, name: packs.name })
          .from(packs)
          .where(filter)
          .orderBy(packs.name, packs.id)
          .limit(page.limit)
          .offset(page.offset)
          .all(),
        total: db.select({ count: count() }).from(packs).where(filter).get()!
          .count,
        limit: page.limit,
        offset: page.offset,
      }
    }
    const filter =
      kind === 'author'
        ? sql`exists (select 1 from ${sampleAuthors} where ${sampleAuthors.sampleId} = ${samples.id} and ${sampleAuthors.authorId} = ${input.id})`
        : sql`exists (select 1 from ${sampleInstruments} where ${sampleInstruments.sampleId} = ${samples.id} and ${sampleInstruments.instrumentId} = ${input.id})`
    const rows = db
      .select({
        id: samples.id,
        name: samples.displayName,
        path: sampleSources.canonicalPath,
      })
      .from(samples)
      .innerJoin(sampleSources, eq(sampleSources.sampleId, samples.id))
      .where(filter)
      .orderBy(samples.id)
      .limit(page.limit)
      .offset(page.offset)
      .all()
    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name ?? basename(row.path),
      })),
      total: db.select({ count: count() }).from(samples).where(filter).get()!
        .count,
      limit: page.limit,
      offset: page.offset,
    }
  })
}

export function listAuthorUses(
  db: AppDatabase,
  input: ClassificationUsesRequest,
): ClassificationPage<ClassificationUse> {
  return listUses(db, input, 'author')
}

export function listInstrumentUses(
  db: AppDatabase,
  input: ClassificationUsesRequest,
): ClassificationPage<ClassificationUse> {
  return listUses(db, input, 'instrument')
}

function reviewRemoval(
  db: AppDatabase,
  id: string,
  kind: 'author' | 'instrument',
): ClassificationRemovalReview {
  const entity = kind === 'author' ? getAuthor(db, id) : getInstrument(db, id)
  const hash = createReviewHash(kind, entity)
  if (kind === 'instrument') {
    const target = db
      .select()
      .from(recognitionVocabulary)
      .where(eq(recognitionVocabulary.instrumentId, id))
      .get()
    if (target) {
      hash.update(
        JSON.stringify(
          db
            .select()
            .from(recognitionAliases)
            .where(eq(recognitionAliases.targetKey, target.key))
            .orderBy(recognitionAliases.id)
            .all(),
        ),
      )
    }
  }
  let sampleCount = 0,
    packCount = 0
  // Hash bounded, ordered batches without transferring every use to the caller.
  function hashUses(
    prefix: string,
    read: (after: string) => { id: string }[],
  ): number {
    let total = 0
    let after = ''
    for (;;) {
      const rows = read(after)
      for (const row of rows) {
        hash.update(`${prefix}:${row.id};`)
      }
      total += rows.length
      if (rows.length < 500) {
        return total
      }
      after = rows[rows.length - 1].id
    }
  }
  if (kind === 'author') {
    sampleCount = hashUses('sample', (after) =>
      db
        .select({ id: sampleAuthors.sampleId })
        .from(sampleAuthors)
        .where(
          and(
            eq(sampleAuthors.authorId, id),
            gt(sampleAuthors.sampleId, after),
          ),
        )
        .orderBy(sampleAuthors.sampleId)
        .limit(500)
        .all(),
    )
    packCount = hashUses('pack', (after) =>
      db
        .select({ id: packAuthors.packId })
        .from(packAuthors)
        .where(and(eq(packAuthors.authorId, id), gt(packAuthors.packId, after)))
        .orderBy(packAuthors.packId)
        .limit(500)
        .all(),
    )
  } else {
    sampleCount = hashUses('sample', (after) =>
      db
        .select({ id: sampleInstruments.sampleId })
        .from(sampleInstruments)
        .where(
          and(
            eq(sampleInstruments.instrumentId, id),
            gt(sampleInstruments.sampleId, after),
          ),
        )
        .orderBy(sampleInstruments.sampleId)
        .limit(500)
        .all(),
    )
    packCount = hashUses('pack', (after) =>
      db
        .select({ id: packInstruments.packId })
        .from(packInstruments)
        .where(
          and(
            eq(packInstruments.instrumentId, id),
            gt(packInstruments.packId, after),
          ),
        )
        .orderBy(packInstruments.packId)
        .limit(500)
        .all(),
    )
  }
  const linkedProfile =
    kind === 'author'
      ? (db
          .select({ id: userProfiles.id, name: userProfiles.name })
          .from(userProfiles)
          .where(eq(userProfiles.authorId, id))
          .get() ?? null)
      : null
  hash.update(JSON.stringify(linkedProfile))
  return {
    entity,
    sampleCount,
    packCount,
    linkedProfile,
    token: hash.digest('hex'),
  }
}

export function reviewAuthorRemoval(
  db: AppDatabase,
  id: string,
): ClassificationRemovalReview {
  return db.transaction(() => reviewRemoval(db, id, 'author'))
}

export function reviewInstrumentRemoval(
  db: AppDatabase,
  id: string,
): ClassificationRemovalReview {
  return db.transaction(() => reviewRemoval(db, id, 'instrument'))
}

export function removeAuthor(
  db: AppDatabase,
  input: ClassificationRemovalRequest,
): { id: string } {
  requireEntityId(input.id)
  requireReviewToken(input.token)
  return db.transaction(
    () => {
      if (reviewRemoval(db, input.id, 'author').token !== input.token) {
        throw new DbError(
          'STALE_REVIEW',
          'Author uses changed. Review them again before removing.',
        )
      }
      db.delete(authors).where(eq(authors.id, input.id)).run()
      return { id: input.id }
    },
    { behavior: 'immediate' },
  )
}

export function removeInstrument(
  db: AppDatabase,
  input: ClassificationRemovalRequest,
): { id: string } {
  requireEntityId(input.id)
  requireReviewToken(input.token)
  return db.transaction(
    () => {
      if (reviewRemoval(db, input.id, 'instrument').token !== input.token) {
        throw new DbError(
          'STALE_REVIEW',
          'Instrument uses changed. Review them again before removing.',
        )
      }
      retireVocabularyEntity(db, 'instrument', input.id)
      db.delete(instruments).where(eq(instruments.id, input.id)).run()
      return { id: input.id }
    },
    { behavior: 'immediate' },
  )
}
