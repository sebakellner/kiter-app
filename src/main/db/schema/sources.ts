import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const sourceRoots = sqliteTable(
  'source_roots',
  {
    id: text('id').primaryKey().notNull(),
    canonicalPath: text('canonical_path').notNull().unique(),
    registered: integer('registered', { mode: 'boolean' })
      .notNull()
      .default(true),
    lastScanAt: text('last_scan_at'),
    lastScanOutcome: text('last_scan_outcome', {
      enum: ['completed', 'failed'],
    }),
    lastScanErrorCode: text('last_scan_error_code'),
  },
  (table) => [
    check('root_registered', sql`${table.registered} IN (0, 1)`),
    check(
      'root_outcome',
      sql`${table.lastScanOutcome} IN ('completed', 'failed')`,
    ),
    check(
      'root_observation',
      sql`(${table.lastScanAt} IS NULL) = (${table.lastScanOutcome} IS NULL)`,
    ),
    check(
      'root_error',
      sql`(${table.lastScanOutcome} IS NOT NULL AND ${table.lastScanOutcome} = 'failed'
        AND ${table.lastScanErrorCode} IS NOT NULL AND length(${table.lastScanErrorCode}) > 0)
        OR (${table.lastScanErrorCode} IS NULL
        AND (${table.lastScanOutcome} IS NULL OR ${table.lastScanOutcome} = 'completed'))`,
    ),
  ],
)

export const excludedSources = sqliteTable('excluded_sources', {
  canonicalPath: text('canonical_path').primaryKey().notNull(),
})
