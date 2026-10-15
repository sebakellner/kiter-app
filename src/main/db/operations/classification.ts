import { createHash, randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import { and, asc, count, eq, gt, sql } from 'drizzle-orm'
import type { AppDatabase } from '../connection.ts'
import {
  requireClassificationName,
  requireClassificationPage,
  normalizeName,
  isClassificationTarget,
} from '../../../shared/domain/classification.ts'
import type {
  Author,
  Category,
  ClassificationPage,
  ClassificationPageRequest,
  ClassificationAssignmentRequest,
  ClassificationTarget,
  ClassificationRemovalReview,
  ClassificationRemovalRequest,
  ClassificationUsesRequest,
  ClassificationUse,
} from '../../../shared/domain/classification.ts'
import {
  requireEntityId,
  DomainValidationError,
} from '../../../shared/domain/validation.ts'
import {
  authors,
  categories,
  sampleAuthors,
  packAuthors,
  sampleCategories,
  packCategories,
} from '../schema/classification.ts'
import { samples, sampleSources } from '../schema/samples.ts'
import { packs } from '../schema/packs.ts'
import { userProfiles } from '../schema/profile.ts'
import { DbError } from '../errors.ts'

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

export function getCategory(db: AppDatabase, id: string): Category {
  requireEntityId(id)
  const row = db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.id, id))
    .get()
  if (!row) {
    throw new DbError('NOT_FOUND', 'The Category no longer exists.')
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

function requireUniqueCategory(
  db: AppDatabase,
  nameKey: string,
  ownId?: string,
): void {
  const existing = db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.nameKey, nameKey))
    .get()
  if (existing && existing.id !== ownId) {
    throw new DbError(
      'NAME_CONFLICT',
      'A Category with this name already exists.',
    )
  }
}

export function createCategory(
  db: AppDatabase,
  input: { name: string },
): Category {
  const name = requireClassificationName(input.name)
  const nameKey = normalizeName(name)
  return db.transaction(
    () => {
      requireUniqueCategory(db, nameKey)
      const entity = { id: randomUUID(), name }
      db.insert(categories)
        .values({ ...entity, nameKey })
        .run()
      return entity
    },
    { behavior: 'immediate' },
  )
}

export function renameCategory(
  db: AppDatabase,
  input: { id: string; name: string },
): Category {
  requireEntityId(input.id)
  const name = requireClassificationName(input.name)
  const nameKey = normalizeName(name)
  return db.transaction(
    () => {
      getCategory(db, input.id)
      requireUniqueCategory(db, nameKey, input.id)
      db.update(categories)
        .set({ name, nameKey })
        .where(eq(categories.id, input.id))
        .run()
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

export function listCategories(
  db: AppDatabase,
  input: ClassificationPageRequest = {},
): ClassificationPage<Category> {
  const page = requireClassificationPage(input)
  const filter = sql`instr(${categories.nameKey}, ${page.search}) > 0`
  return db.transaction(() => ({
    items: db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(filter)
      .orderBy(asc(categories.nameKey), asc(categories.id))
      .limit(page.limit)
      .offset(page.offset)
      .all(),
    total: db.select({ count: count() }).from(categories).where(filter).get()!
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

export function setCategoryAssignment(
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
      getCategory(db, input.id)
      requireExistingTarget(db, input.target)
      if (input.target.kind === 'sample') {
        if (input.assigned) {
          db.insert(sampleCategories)
            .values({ sampleId: input.target.id, categoryId: input.id })
            .onConflictDoNothing()
            .run()
        } else {
          db.delete(sampleCategories)
            .where(
              and(
                eq(sampleCategories.sampleId, input.target.id),
                eq(sampleCategories.categoryId, input.id),
              ),
            )
            .run()
        }
      } else {
        if (input.assigned) {
          db.insert(packCategories)
            .values({ packId: input.target.id, categoryId: input.id })
            .onConflictDoNothing()
            .run()
        } else {
          db.delete(packCategories)
            .where(
              and(
                eq(packCategories.packId, input.target.id),
                eq(packCategories.categoryId, input.id),
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

export function listTargetCategories(
  db: AppDatabase,
  target: ClassificationTarget,
  input: ClassificationPageRequest = {},
): ClassificationPage<Category> {
  requireTarget(target)
  const page = requireClassificationPage(input)
  return db.transaction(() => {
    requireExistingTarget(db, target)
    const assigned =
      target.kind === 'sample'
        ? sql`exists (select 1 from ${sampleCategories} where ${sampleCategories.categoryId} = ${categories.id} and ${sampleCategories.sampleId} = ${target.id})`
        : sql`exists (select 1 from ${packCategories} where ${packCategories.categoryId} = ${categories.id} and ${packCategories.packId} = ${target.id})`
    const filter = and(
      assigned,
      sql`instr(${categories.nameKey}, ${page.search}) > 0`,
    )
    return {
      items: db
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(filter)
        .orderBy(categories.nameKey, categories.id)
        .limit(page.limit)
        .offset(page.offset)
        .all(),
      total: db.select({ count: count() }).from(categories).where(filter).get()!
        .count,
      limit: page.limit,
      offset: page.offset,
    }
  })
}

function listUses(
  db: AppDatabase,
  input: ClassificationUsesRequest,
  kind: 'author' | 'category',
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
      getCategory(db, input.id)
    }
    if (input.kind === 'pack') {
      const filter =
        kind === 'author'
          ? sql`exists (select 1 from ${packAuthors} where ${packAuthors.packId} = ${packs.id} and ${packAuthors.authorId} = ${input.id})`
          : sql`exists (select 1 from ${packCategories} where ${packCategories.packId} = ${packs.id} and ${packCategories.categoryId} = ${input.id})`
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
        : sql`exists (select 1 from ${sampleCategories} where ${sampleCategories.sampleId} = ${samples.id} and ${sampleCategories.categoryId} = ${input.id})`
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

export function listCategoryUses(
  db: AppDatabase,
  input: ClassificationUsesRequest,
): ClassificationPage<ClassificationUse> {
  return listUses(db, input, 'category')
}

function reviewRemoval(
  db: AppDatabase,
  id: string,
  kind: 'author' | 'category',
): ClassificationRemovalReview {
  const entity = kind === 'author' ? getAuthor(db, id) : getCategory(db, id)
  const hash = createHash('sha256').update(JSON.stringify([kind, entity]))
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
        .select({ id: sampleCategories.sampleId })
        .from(sampleCategories)
        .where(
          and(
            eq(sampleCategories.categoryId, id),
            gt(sampleCategories.sampleId, after),
          ),
        )
        .orderBy(sampleCategories.sampleId)
        .limit(500)
        .all(),
    )
    packCount = hashUses('pack', (after) =>
      db
        .select({ id: packCategories.packId })
        .from(packCategories)
        .where(
          and(
            eq(packCategories.categoryId, id),
            gt(packCategories.packId, after),
          ),
        )
        .orderBy(packCategories.packId)
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

export function reviewCategoryRemoval(
  db: AppDatabase,
  id: string,
): ClassificationRemovalReview {
  return db.transaction(() => reviewRemoval(db, id, 'category'))
}

function requireReviewToken(token: unknown): void {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    throw new DomainValidationError('A removal review token is required.')
  }
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

export function removeCategory(
  db: AppDatabase,
  input: ClassificationRemovalRequest,
): { id: string } {
  requireEntityId(input.id)
  requireReviewToken(input.token)
  return db.transaction(
    () => {
      if (reviewRemoval(db, input.id, 'category').token !== input.token) {
        throw new DbError(
          'STALE_REVIEW',
          'Category uses changed. Review them again before removing.',
        )
      }
      db.delete(categories).where(eq(categories.id, input.id)).run()
      return { id: input.id }
    },
    { behavior: 'immediate' },
  )
}
