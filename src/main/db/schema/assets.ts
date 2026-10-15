import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import {
  IMAGE_MAX_BYTES,
  IMAGE_MAX_DIMENSION,
} from '../../../shared/domain/imageAsset.ts'

export const imageAssets = sqliteTable(
  'image_assets',
  {
    id: text('id').primaryKey().notNull(),
    storageKey: text('storage_key').notNull().unique(),
    mimeType: text('mime_type', {
      enum: ['image/png', 'image/jpeg', 'image/webp'],
    }).notNull(),
    byteSize: integer('byte_size').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    state: text('state', { enum: ['ready', 'cleanup_pending'] })
      .notNull()
      .default('ready'),
  },
  (table) => [
    check(
      'image_mime',
      sql`${table.mimeType} IN ('image/png', 'image/jpeg', 'image/webp')`,
    ),
    check(
      'image_size',
      sql`${table.byteSize} BETWEEN 1 AND ${sql.raw(String(IMAGE_MAX_BYTES))}`,
    ),
    check(
      'image_width',
      sql`${table.width} BETWEEN 1 AND ${sql.raw(String(IMAGE_MAX_DIMENSION))}`,
    ),
    check(
      'image_height',
      sql`${table.height} BETWEEN 1 AND ${sql.raw(String(IMAGE_MAX_DIMENSION))}`,
    ),
    check('image_state', sql`${table.state} IN ('ready', 'cleanup_pending')`),
    check(
      'image_storage_key',
      sql`(${table.mimeType} = 'image/png' AND ${table.storageKey} = ${table.id} || '.png')
        OR (${table.mimeType} = 'image/jpeg' AND ${table.storageKey} = ${table.id} || '.jpg')
        OR (${table.mimeType} = 'image/webp' AND ${table.storageKey} = ${table.id} || '.webp')`,
    ),
  ],
)
