import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
import { packs } from './packs.ts'
import { sourceRoots } from './sources.ts'

export const samples = sqliteTable(
  'samples',
  {
    id: text('id').primaryKey().notNull(),
    displayName: text('display_name'),
    // Materialized by the write path so catalog search never evaluates a JS
    // function per row. It follows displayName, so a rename writes it here.
    searchName: text('search_name').notNull().default(''),
    notes: text('notes'),
    sampleType: text('sample_type', { enum: ['loop', 'one-shot'] }),
    favorite: integer('favorite', { mode: 'boolean' }).notNull().default(false),
    packId: text('pack_id').references(() => packs.id, {
      onDelete: 'set null',
    }),
    originAssignment: text('origin_assignment', {
      enum: ['automatic', 'manual'],
    })
      .notNull()
      .default('automatic'),
  },
  (table) => [
    check(
      'sample_name',
      sql`${table.displayName} IS NULL OR length(trim(${table.displayName})) > 0`,
    ),
    check('sample_favorite', sql`${table.favorite} IN (0, 1)`),
    check(
      'sample_type',
      sql`${table.sampleType} IS NULL OR ${table.sampleType} IN ('loop', 'one-shot')`,
    ),
    check(
      'sample_origin',
      sql`${table.originAssignment} IN ('automatic', 'manual')`,
    ),
    index('samples_by_pack').on(table.packId, table.id),
    index('favorite_samples')
      .on(table.id)
      .where(sql`${table.favorite} = 1`),
  ],
)

export const sampleSources = sqliteTable(
  'sample_sources',
  {
    sampleId: text('sample_id')
      .primaryKey()
      .notNull()
      .references(() => samples.id, { onDelete: 'cascade' }),
    canonicalPath: text('canonical_path').notNull().unique(),
    // Materialized from the canonical path, so search does not pay a JS callback
    // per row. Both values below are immutable once the row exists.
    searchFilename: text('search_filename').notNull().default(''),
    availability: text('availability', {
      enum: ['available', 'missing', 'inaccessible'],
    }).notNull(),
    revision: integer('revision').notNull().default(1),
    observedSizeBytes: integer('observed_size_bytes'),
    observedMtimeMs: real('observed_mtime_ms'),
    lastCheckedAt: text('last_checked_at').notNull(),
    lastErrorCode: text('last_error_code'),
  },
  (table) => [
    check(
      'source_availability',
      sql`${table.availability} IN ('available', 'missing', 'inaccessible')`,
    ),
    check('source_revision', sql`${table.revision} >= 1`),
    check('source_size', sql`${table.observedSizeBytes} >= 0`),
    check(
      'source_error',
      sql`(${table.availability} = 'available' AND ${table.lastErrorCode} IS NULL)
        OR (${table.availability} IN ('missing', 'inaccessible')
        AND ${table.lastErrorCode} IS NOT NULL AND length(${table.lastErrorCode}) > 0)`,
    ),
  ],
)

export const sourceRootSamples = sqliteTable(
  'source_root_samples',
  {
    sourceRootId: text('source_root_id')
      .notNull()
      .references(() => sourceRoots.id, { onDelete: 'restrict' }),
    sampleId: text('sample_id')
      .notNull()
      .references(() => samples.id, { onDelete: 'cascade' }),
    present: integer('present', { mode: 'boolean' }).notNull(),
    // The relative path is a property of the Sample *under this root*, so it only
    // depends on this row. Which root the catalog displays and whether it counts
    // at all depends on registration, and that stays a live query decision.
    searchRelativePath: text('search_relative_path').notNull().default(''),
  },
  (table) => [
    primaryKey({ columns: [table.sourceRootId, table.sampleId] }),
    check('root_sample_present', sql`${table.present} IN (0, 1)`),
    index('roots_by_sample').on(table.sampleId, table.sourceRootId),
  ],
)
