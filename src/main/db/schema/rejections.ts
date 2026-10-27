import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

// Remembered classification rejections, keyed by subject + target identity.
// `record` holds the canonical contract record; the extracted columns provide
// uniqueness and bounded subject-scoped reads without JSON parsing.
export const classificationRejections = sqliteTable(
  'classification_rejections',
  {
    contractVersion: integer('contract_version').notNull(),
    subjectKey: text('subject_key').notNull(),
    dimension: text('dimension').notNull(),
    targetKey: text('target_key').notNull(),
    record: text('record').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.subjectKey, table.dimension, table.targetKey],
    }),
    index('rejections_by_subject').on(table.subjectKey),
  ],
)
