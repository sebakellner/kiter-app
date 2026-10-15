import { sql } from 'drizzle-orm'
import { check, index, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { imageAssets } from './assets.ts'
import { sourceRoots } from './sources.ts'

export const packs = sqliteTable(
  'packs',
  {
    id: text('id').primaryKey().notNull(),
    sourceRootId: text('source_root_id')
      .notNull()
      .unique()
      .references(() => sourceRoots.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description'),
    coverAssetId: text('cover_asset_id').references(() => imageAssets.id, {
      onDelete: 'restrict',
    }),
  },
  (table) => [
    check('pack_name', sql`length(trim(${table.name})) > 0`),
    index('packs_by_cover').on(table.coverAssetId),
  ],
)
