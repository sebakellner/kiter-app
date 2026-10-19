import { randomUUID } from 'node:crypto'
import type { Page } from '../../../../shared/domain/pagination.ts'
import { and, asc, count, eq } from 'drizzle-orm'
import type { AppDatabase } from '../../runtime/connection.ts'
import { instruments } from '../../schema/classification.ts'
import {
  genres,
  recognitionAliases as aliases,
  recognitionVocabulary as vocabulary,
} from '../../schema/recognition.ts'
import { initialRecognitionVocabulary } from '../../../services/classification/vocabulary.ts'
import {
  normalizeName,
  requireClassificationPage,
} from '../../../../shared/domain/classification.ts'
import { recognitionKey } from '../../../../shared/domain/recognition.ts'
import type {
  AliasWriteRequest,
  RecognitionAlias,
  RecognitionDimension,
  VocabularyEntry,
} from '../../../../shared/domain/recognition.ts'
import type { ClassificationPageRequest } from '../../../../shared/domain/classification.ts'
import { requireEntityId } from '../../../../shared/domain/validation.ts'
import { DbError } from '../../errors.ts'

export function initializeRecognitionVocabulary(
  db: AppDatabase,
  fresh: boolean,
): void {
  for (const entry of initialRecognitionVocabulary) {
    if (
      db
        .select()
        .from(vocabulary)
        .where(eq(vocabulary.key, entry.target.key))
        .get()
    ) {
      continue
    }
    const dimension = entry.target.dimension
    const table = dimension === 'instrument' ? instruments : genres
    const existing =
      dimension === 'sample-type'
        ? undefined
        : db
            .select()
            .from(table)
            .where(eq(table.nameKey, normalizeName(entry.name)))
            .get()
    let entityId = existing?.id ?? null
    if (fresh && dimension === 'genre') {
      entityId = randomUUID()
      db.insert(genres)
        .values({
          id: entityId,
          name: entry.name,
          nameKey: normalizeName(entry.name),
        })
        .run()
    }
    const state =
      dimension === 'genre' && !fresh && !existing ? 'offered' : 'active'
    db.insert(vocabulary)
      .values({
        key: entry.target.key,
        dimension,
        name: existing?.name ?? entry.name,
        instrumentId: dimension === 'instrument' ? entityId : null,
        genreId: dimension === 'genre' ? entityId : null,
        state,
      })
      .run()
    const names = new Set([recognitionKey(entry.name)])
    for (const term of entry.aliases) {
      const termKey = recognitionKey(term)
      if (names.has(termKey)) {
        continue
      }
      names.add(termKey)
      const conflict = db
        .select()
        .from(aliases)
        .where(
          and(
            eq(aliases.dimension, dimension),
            eq(aliases.termKey, termKey),
            eq(aliases.deleted, false),
          ),
        )
        .get()
      const nameConflict =
        dimension !== 'sample-type' &&
        db
          .select()
          .from(table)
          .all()
          .some(
            (row) =>
              row.id !== entityId && recognitionKey(row.name) === termKey,
          )
      db.insert(aliases)
        .values({
          id: randomUUID(),
          targetKey: entry.target.key,
          term,
          termKey,
          dimension,
          suppliedKey: `${entry.target.key}:${termKey}`,
          deleted: Boolean(conflict || nameConflict),
        })
        .run()
    }
  }
  // Bind existing custom instruments without changing names or creating Instruments.
  for (const instrument of db.select().from(instruments).all()) {
    if (
      !db
        .select()
        .from(vocabulary)
        .where(eq(vocabulary.instrumentId, instrument.id))
        .get()
    ) {
      registerVocabularyEntity(db, 'instrument', instrument)
    }
  }
}

export function registerVocabularyEntity(
  db: AppDatabase,
  dimension: 'instrument' | 'genre',
  entity: { id: string; name: string },
): void {
  const offered = db
    .select()
    .from(vocabulary)
    .where(eq(vocabulary.dimension, dimension))
    .all()
    .find(
      (row) =>
        row.instrumentId === null &&
        row.genreId === null &&
        row.state !== 'deleted' &&
        recognitionKey(row.name) === recognitionKey(entity.name),
    )
  if (offered) {
    db.update(vocabulary)
      .set({
        instrumentId: dimension === 'instrument' ? entity.id : null,
        genreId: dimension === 'genre' ? entity.id : null,
        name: entity.name,
        state: 'active',
      })
      .where(eq(vocabulary.key, offered.key))
      .run()
  } else {
    db.insert(vocabulary)
      .values({
        key: `${dimension}:${entity.id}`,
        dimension,
        name: entity.name,
        instrumentId: dimension === 'instrument' ? entity.id : null,
        genreId: dimension === 'genre' ? entity.id : null,
        state: 'active',
      })
      .run()
  }
}

export function requireRecognitionNameAvailable(
  db: AppDatabase,
  dimension: RecognitionDimension,
  name: string,
  ownKey?: string,
): void {
  const key = recognitionKey(name)
  const conflict = db
    .select()
    .from(vocabulary)
    .where(eq(vocabulary.dimension, dimension))
    .all()
    .some(
      (row) =>
        row.state !== 'deleted' &&
        (row.instrumentId !== null ||
          row.genreId !== null ||
          dimension === 'sample-type') &&
        row.key !== ownKey &&
        recognitionKey(row.name) === key,
    )
  const alias = db
    .select()
    .from(aliases)
    .where(
      and(
        eq(aliases.dimension, dimension),
        eq(aliases.termKey, key),
        eq(aliases.deleted, false),
      ),
    )
    .get()
  if (conflict || (alias && alias.targetKey !== ownKey)) {
    throw new DbError(
      'NAME_CONFLICT',
      'The recognition term belongs to another classification.',
    )
  }
}

export function writeRecognitionAlias(
  db: AppDatabase,
  input: AliasWriteRequest,
): RecognitionAlias {
  if (input.id !== undefined) {
    requireEntityId(input.id)
  }
  const termKey = recognitionKey(input.term)
  return db.transaction(
    () => {
      const target = db
        .select()
        .from(vocabulary)
        .where(eq(vocabulary.key, input.targetKey))
        .get()
      if (!target || target.state === 'deleted') {
        throw new DbError(
          'NOT_FOUND',
          'The recognition target no longer exists.',
        )
      }
      const prior = input.id
        ? db.select().from(aliases).where(eq(aliases.id, input.id)).get()
        : undefined
      if (input.id && (!prior || prior.deleted)) {
        throw new DbError('NOT_FOUND', 'The alias no longer exists.')
      }
      const nameConflict = db
        .select()
        .from(vocabulary)
        .where(eq(vocabulary.dimension, target.dimension))
        .all()
        .some(
          (row) =>
            row.state !== 'deleted' &&
            row.key !== target.key &&
            recognitionKey(row.name) === termKey,
        )
      const conflict = db
        .select()
        .from(aliases)
        .where(
          and(
            eq(aliases.dimension, target.dimension),
            eq(aliases.termKey, termKey),
            eq(aliases.deleted, false),
          ),
        )
        .get()
      if (nameConflict || (conflict && conflict.id !== input.id)) {
        throw new DbError(
          'NAME_CONFLICT',
          'The recognition term is already in use.',
        )
      }
      const values = {
        targetKey: target.key,
        term: input.term.trim().normalize('NFC'),
        termKey,
        dimension: target.dimension,
      }
      const id = prior?.id ?? randomUUID()
      if (prior) {
        db.update(aliases).set(values).where(eq(aliases.id, id)).run()
      } else {
        db.insert(aliases)
          .values({ id, ...values })
          .run()
      }
      return {
        id,
        targetKey: target.key,
        term: values.term,
        suppliedKey: prior?.suppliedKey ?? null,
      }
    },
    { behavior: 'immediate' },
  )
}

export function removeRecognitionAlias(
  db: AppDatabase,
  id: string,
): { id: string } {
  requireEntityId(id)
  const result = db
    .update(aliases)
    .set({ deleted: true })
    .where(and(eq(aliases.id, id), eq(aliases.deleted, false)))
    .run()
  if (!result.changes) {
    throw new DbError('NOT_FOUND', 'The alias no longer exists.')
  }
  return { id }
}

export function listRecognitionAliases(
  db: AppDatabase,
  input: ClassificationPageRequest = {},
): Page<RecognitionAlias> {
  const page = requireClassificationPage(input)
  const filter = eq(aliases.deleted, false)
  return db.transaction(() => ({
    items: db
      .select({
        id: aliases.id,
        targetKey: aliases.targetKey,
        term: aliases.term,
        suppliedKey: aliases.suppliedKey,
      })
      .from(aliases)
      .where(filter)
      .orderBy(asc(aliases.id))
      .limit(page.limit)
      .offset(page.offset)
      .all(),
    total: db.select({ total: count() }).from(aliases).where(filter).get()!
      .total,
    limit: page.limit,
    offset: page.offset,
  }))
}

export function listRecognitionVocabulary(
  db: AppDatabase,
  input: ClassificationPageRequest = {},
): Page<VocabularyEntry> {
  const page = requireClassificationPage(input)
  return db.transaction(() => ({
    items: db
      .select()
      .from(vocabulary)
      .orderBy(asc(vocabulary.key))
      .limit(page.limit)
      .offset(page.offset)
      .all()
      .map((row): VocabularyEntry => ({
        key: row.key,
        dimension: row.dimension,
        name: row.name,
        entityId: row.instrumentId ?? row.genreId,
        state: row.state,
      })),
    total: db.select({ total: count() }).from(vocabulary).get()!.total,
    limit: page.limit,
    offset: page.offset,
  }))
}

export function retireVocabularyEntity(
  db: AppDatabase,
  dimension: 'instrument' | 'genre',
  id: string,
): void {
  const field =
    dimension === 'instrument' ? vocabulary.instrumentId : vocabulary.genreId
  const target = db.select().from(vocabulary).where(eq(field, id)).get()
  if (target) {
    db.update(aliases)
      .set({ deleted: true })
      .where(eq(aliases.targetKey, target.key))
      .run()
    db.update(vocabulary)
      .set({ state: 'deleted' })
      .where(eq(vocabulary.key, target.key))
      .run()
  }
}
