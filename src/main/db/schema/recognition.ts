import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { instruments } from './classification.ts'
import { samples } from './samples.ts'
import { packs } from './packs.ts'
import { recognitionDimension } from './recognition-dimension.ts'

export const genres = sqliteTable(
  'genres',
  {
    id: text('id').primaryKey().notNull(),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull().unique(),
  },
  (table) => [
    check('genre_name', sql`length(trim(${table.name})) > 0`),
    check('genre_key', sql`length(${table.nameKey}) > 0`),
  ],
)

export const sampleGenres = sqliteTable(
  'sample_genres',
  {
    sampleId: text('sample_id')
      .notNull()
      .references(() => samples.id, { onDelete: 'cascade' }),
    genreId: text('genre_id')
      .notNull()
      .references(() => genres.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.sampleId, table.genreId] }),
    index('samples_by_genre').on(table.genreId, table.sampleId),
  ],
)

export const packGenres = sqliteTable(
  'pack_genres',
  {
    packId: text('pack_id')
      .notNull()
      .references(() => packs.id, { onDelete: 'cascade' }),
    genreId: text('genre_id')
      .notNull()
      .references(() => genres.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.packId, table.genreId] }),
    index('packs_by_genre').on(table.genreId, table.packId),
  ],
)

export const recognitionVocabulary = sqliteTable(
  'recognition_vocabulary',
  {
    key: text('key').primaryKey().notNull(),
    dimension: recognitionDimension('dimension').notNull(),
    name: text('name').notNull(),
    instrumentId: text('category_id')
      .unique()
      .references(() => instruments.id, { onDelete: 'set null' }),
    genreId: text('genre_id')
      .unique()
      .references(() => genres.id, { onDelete: 'set null' }),
    state: text('state', { enum: ['active', 'offered', 'deleted'] }).notNull(),
  },
  (table) => [
    check(
      'vocabulary_dimension',
      sql`${table.dimension} in ('category', 'genre', 'sample-type')`,
    ),
    check(
      'vocabulary_state',
      sql`${table.state} in ('active', 'offered', 'deleted')`,
    ),
    check(
      'vocabulary_target',
      sql`(${table.instrumentId} is null or ${table.dimension} = 'category') and (${table.genreId} is null or ${table.dimension} = 'genre')`,
    ),
    check('vocabulary_name', sql`length(trim(${table.name})) > 0`),
  ],
)

export const recognitionAliases = sqliteTable(
  'recognition_aliases',
  {
    id: text('id').primaryKey().notNull(),
    targetKey: text('target_key')
      .notNull()
      .references(() => recognitionVocabulary.key, { onDelete: 'cascade' }),
    term: text('term').notNull(),
    termKey: text('term_key').notNull(),
    suppliedKey: text('supplied_key').unique(),
    dimension: recognitionDimension('dimension').notNull(),
    deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => [
    check(
      'alias_term',
      sql`length(trim(${table.term})) > 0 and length(${table.termKey}) > 0`,
    ),
    check(
      'alias_dimension',
      sql`${table.dimension} in ('category', 'genre', 'sample-type')`,
    ),
    check('alias_deleted', sql`${table.deleted} in (0, 1)`),
    uniqueIndex('aliases_by_dimension_term')
      .on(table.dimension, table.termKey)
      .where(sql`${table.deleted} = 0`),
    index('aliases_by_target').on(table.targetKey, table.id),
  ],
)
