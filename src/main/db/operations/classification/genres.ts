import { randomUUID } from 'node:crypto'
import type { Genre } from '../../../../shared/domain/recognition.ts'
import type { Page } from '../../../../shared/domain/pagination.ts'
import type { ClassificationRemovalReview } from '../../../../shared/domain/classification.ts'
import { and, count, eq, gt, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../runtime/connection.ts'
import {
  genres,
  sampleGenres,
  packGenres,
  recognitionVocabulary,
  recognitionAliases,
} from '../../schema/recognition.ts'
import { samples } from '../../schema/samples.ts'
import { packs } from '../../schema/packs.ts'
import {
  requireClassificationName,
  normalizeName,
  requireClassificationPage,
  isClassificationTarget,
} from '../../../../shared/domain/classification.ts'
import type {
  ClassificationPageRequest,
  ClassificationTarget,
  ClassificationAssignmentRequest,
  ClassificationRemovalRequest,
} from '../../../../shared/domain/classification.ts'
import {
  requireEntityId,
  DomainValidationError,
} from '../../../../shared/domain/validation.ts'
import { DbError } from '../../errors.ts'
import {
  createReviewHash,
  requireReviewToken,
} from '../../internal/review-token.ts'
import {
  registerVocabularyEntity,
  requireRecognitionNameAvailable,
  retireVocabularyEntity,
} from './vocabulary.ts'

export function getGenre(db: AppDatabase, id: string): Genre {
  requireEntityId(id)
  const row = db
    .select({ id: genres.id, name: genres.name })
    .from(genres)
    .where(eq(genres.id, id))
    .get()
  if (!row) {
    throw new DbError('NOT_FOUND', 'The Genre no longer exists.')
  }
  return row
}

export function createGenre(db: AppDatabase, input: { name: string }): Genre {
  const name = requireClassificationName(input.name)
  return db.transaction(
    () => {
      const offered = db
        .select()
        .from(recognitionVocabulary)
        .where(eq(recognitionVocabulary.dimension, 'genre'))
        .all()
        .find(
          (row) =>
            row.genreId === null &&
            row.state !== 'deleted' &&
            normalizeName(row.name) === normalizeName(name),
        )
      requireRecognitionNameAvailable(db, 'genre', name, offered?.key)
      if (
        db
          .select()
          .from(genres)
          .where(eq(genres.nameKey, normalizeName(name)))
          .get()
      ) {
        throw new DbError(
          'NAME_CONFLICT',
          'A Genre with this name already exists.',
        )
      }
      const entity = { id: randomUUID(), name }
      db.insert(genres)
        .values({ ...entity, nameKey: normalizeName(name) })
        .run()
      registerVocabularyEntity(db, 'genre', entity)
      return entity
    },
    { behavior: 'immediate' },
  )
}

export function renameGenre(
  db: AppDatabase,
  input: { id: string; name: string },
): Genre {
  requireEntityId(input.id)
  const name = requireClassificationName(input.name)
  return db.transaction(
    () => {
      getGenre(db, input.id)
      const target = db
        .select()
        .from(recognitionVocabulary)
        .where(eq(recognitionVocabulary.genreId, input.id))
        .get()!
      requireRecognitionNameAvailable(db, 'genre', name, target.key)
      db.update(genres)
        .set({ name, nameKey: normalizeName(name) })
        .where(eq(genres.id, input.id))
        .run()
      db.update(recognitionVocabulary)
        .set({ name })
        .where(eq(recognitionVocabulary.key, target.key))
        .run()
      return { id: input.id, name }
    },
    { behavior: 'immediate' },
  )
}

function requireTarget(db: AppDatabase, target: ClassificationTarget): void {
  if (!isClassificationTarget(target)) {
    throw new DomainValidationError('Invalid classification target.')
  }
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

export function listGenres(
  db: AppDatabase,
  input: ClassificationPageRequest = {},
  target?: ClassificationTarget,
): Page<Genre> {
  const page = requireClassificationPage(input)
  return db.transaction(() => {
    if (target) {
      requireTarget(db, target)
    }
    const assigned = !target
      ? undefined
      : target.kind === 'sample'
        ? sql`exists (select 1 from ${sampleGenres} where ${sampleGenres.genreId} = ${genres.id} and ${sampleGenres.sampleId} = ${target.id})`
        : sql`exists (select 1 from ${packGenres} where ${packGenres.genreId} = ${genres.id} and ${packGenres.packId} = ${target.id})`
    const filter = and(
      assigned,
      sql`instr(${genres.nameKey}, ${page.search}) > 0`,
    )
    return {
      items: db
        .select({ id: genres.id, name: genres.name })
        .from(genres)
        .where(filter)
        .orderBy(genres.nameKey, genres.id)
        .limit(page.limit)
        .offset(page.offset)
        .all(),
      total: db.select({ total: count() }).from(genres).where(filter).get()!
        .total,
      limit: page.limit,
      offset: page.offset,
    }
  })
}

export function setGenreAssignment(
  db: AppDatabase,
  input: ClassificationAssignmentRequest,
): { assigned: boolean } {
  requireEntityId(input.id)
  if (typeof input.assigned !== 'boolean') {
    throw new DomainValidationError('Invalid assignment state.')
  }
  return db.transaction(
    () => {
      getGenre(db, input.id)
      requireTarget(db, input.target)
      if (input.target.kind === 'sample') {
        if (input.assigned) {
          db.insert(sampleGenres)
            .values({ sampleId: input.target.id, genreId: input.id })
            .onConflictDoNothing()
            .run()
        } else {
          db.delete(sampleGenres)
            .where(
              and(
                eq(sampleGenres.sampleId, input.target.id),
                eq(sampleGenres.genreId, input.id),
              ),
            )
            .run()
        }
      } else {
        if (input.assigned) {
          db.insert(packGenres)
            .values({ packId: input.target.id, genreId: input.id })
            .onConflictDoNothing()
            .run()
        } else {
          db.delete(packGenres)
            .where(
              and(
                eq(packGenres.packId, input.target.id),
                eq(packGenres.genreId, input.id),
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

export function reviewGenreRemoval(
  db: AppDatabase,
  id: string,
): ClassificationRemovalReview {
  return db.transaction(() => {
    const entity = getGenre(db, id)
    const hash = createReviewHash('genre', entity)
    const target = db
      .select()
      .from(recognitionVocabulary)
      .where(eq(recognitionVocabulary.genreId, id))
      .get()!
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
    function hashUses(kind: 'sample' | 'pack'): number {
      let after = '',
        total = 0
      for (;;) {
        const rows =
          kind === 'sample'
            ? db
                .select({ id: sampleGenres.sampleId })
                .from(sampleGenres)
                .where(
                  and(
                    eq(sampleGenres.genreId, id),
                    gt(sampleGenres.sampleId, after),
                  ),
                )
                .orderBy(sampleGenres.sampleId)
                .limit(500)
                .all()
            : db
                .select({ id: packGenres.packId })
                .from(packGenres)
                .where(
                  and(eq(packGenres.genreId, id), gt(packGenres.packId, after)),
                )
                .orderBy(packGenres.packId)
                .limit(500)
                .all()
        for (const row of rows) {
          hash.update(`${kind}:${row.id};`)
        }
        total += rows.length
        if (rows.length < 500) {
          return total
        }
        after = rows[rows.length - 1].id
      }
    }
    const sampleCount = hashUses('sample'),
      packCount = hashUses('pack')
    return {
      entity,
      sampleCount,
      packCount,
      linkedProfile: null,
      token: hash.digest('hex'),
    }
  })
}

export function removeGenre(
  db: AppDatabase,
  input: ClassificationRemovalRequest,
): { id: string } {
  requireEntityId(input.id)
  requireReviewToken(input.token)
  return db.transaction(
    () => {
      if (reviewGenreRemoval(db, input.id).token !== input.token) {
        throw new DbError(
          'STALE_REVIEW',
          'Genre uses changed. Review them again before removing.',
        )
      }
      retireVocabularyEntity(db, 'genre', input.id)
      db.delete(genres).where(eq(genres.id, input.id)).run()
      return { id: input.id }
    },
    { behavior: 'immediate' },
  )
}
