import { sql } from 'drizzle-orm'
import { check, index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { packs } from './packs.ts'
import { samples } from './samples.ts'

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey().notNull(),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull().unique()
  },
  (table) => [
    check('category_name', sql`length(trim(${table.name})) > 0`),
    check('category_key', sql`length(${table.nameKey}) > 0`)
  ]
)

export const authors = sqliteTable(
  'authors',
  {
    id: text('id').primaryKey().notNull(),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull()
  },
  (table) => [
    check('author_name', sql`length(trim(${table.name})) > 0`),
    check('author_key', sql`length(${table.nameKey}) > 0`),
    index('authors_by_name_key').on(table.nameKey, table.id)
  ]
)

export const sampleCategories = sqliteTable(
  'sample_categories',
  {
    sampleId: text('sample_id')
      .notNull()
      .references(() => samples.id, { onDelete: 'cascade' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' })
  },
  (table) => [
    primaryKey({ columns: [table.sampleId, table.categoryId] }),
    index('samples_by_category').on(table.categoryId, table.sampleId)
  ]
)

export const packCategories = sqliteTable(
  'pack_categories',
  {
    packId: text('pack_id')
      .notNull()
      .references(() => packs.id, { onDelete: 'cascade' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' })
  },
  (table) => [
    primaryKey({ columns: [table.packId, table.categoryId] }),
    index('packs_by_category').on(table.categoryId, table.packId)
  ]
)

export const packAuthors = sqliteTable(
  'pack_authors',
  {
    packId: text('pack_id')
      .notNull()
      .references(() => packs.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => authors.id, { onDelete: 'cascade' })
  },
  (table) => [
    primaryKey({ columns: [table.packId, table.authorId] }),
    index('packs_by_author').on(table.authorId, table.packId)
  ]
)

export const sampleAuthors = sqliteTable(
  'sample_authors',
  {
    sampleId: text('sample_id')
      .notNull()
      .references(() => samples.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => authors.id, { onDelete: 'cascade' })
  },
  (table) => [
    primaryKey({ columns: [table.sampleId, table.authorId] }),
    index('samples_by_author').on(table.authorId, table.sampleId)
  ]
)
