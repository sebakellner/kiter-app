import { sql } from 'drizzle-orm'
import {
  check,
  integer,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
import { authors } from './classification.ts'
import { imageAssets } from './assets.ts'

export const userProfiles = sqliteTable(
  'user_profiles',
  {
    id: text('id').primaryKey().notNull(),
    singleton: integer('singleton').notNull().default(1).unique(),
    name: text('name').notNull(),
    avatarAssetId: text('avatar_asset_id').references(() => imageAssets.id, {
      onDelete: 'restrict',
    }),
    authorId: text('author_id').references(() => authors.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    check('profile_singleton', sql`${table.singleton} = 1`),
    check('profile_name', sql`length(trim(${table.name})) > 0`),
  ],
)

export const userPreferences = sqliteTable(
  'user_preferences',
  {
    profileId: text('profile_id')
      .primaryKey()
      .notNull()
      .references(() => userProfiles.id, { onDelete: 'cascade' }),
    previewVolume: real('preview_volume').notNull().default(1),
  },
  (table) => [
    check('preview_volume_range', sql`${table.previewVolume} BETWEEN 0 AND 1`),
  ],
)
