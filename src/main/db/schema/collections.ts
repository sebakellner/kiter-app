import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique
} from 'drizzle-orm/sqlite-core'
import { imageAssets } from './assets.ts'
import { samples } from './samples.ts'

export const collections = sqliteTable(
  'collections',
  {
    id: text('id').primaryKey().notNull(),
    name: text('name').notNull(),
    description: text('description'),
    coverAssetId: text('cover_asset_id').references(() => imageAssets.id, { onDelete: 'restrict' })
  },
  (table) => [
    check('collection_name', sql`length(trim(${table.name})) > 0`),
    index('collections_by_cover').on(table.coverAssetId)
  ]
)

export const collectionSamples = sqliteTable(
  'collection_samples',
  {
    collectionId: text('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    sampleId: text('sample_id')
      .notNull()
      .references(() => samples.id, { onDelete: 'cascade' }),
    position: integer('position').notNull()
  },
  (table) => [
    primaryKey({ columns: [table.collectionId, table.sampleId] }),
    unique('collection_position').on(table.collectionId, table.position),
    check('collection_position_nonnegative', sql`${table.position} >= 0`),
    index('collections_by_sample').on(table.sampleId, table.collectionId)
  ]
)
