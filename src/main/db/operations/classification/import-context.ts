import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../runtime/connection.ts'
import { DbError } from '../../errors.ts'
import {
  importClassificationContextRequestSchema,
  type ImportClassificationContext,
  type ImportClassificationContextRequest,
} from '../../../../shared/features/classification/import-context-schemas.ts'
import {
  recognitionVocabulary,
  recognitionAliases,
  sampleGenres,
  packGenres,
} from '../../schema/recognition.ts'
import {
  sampleInstruments,
  packInstruments,
} from '../../schema/classification.ts'
import { samples } from '../../schema/samples.ts'
import { packs } from '../../schema/packs.ts'

// Bounded read transaction; tokens pin vocabulary across pages and target reads.
export function readImportClassificationContext(
  db: AppDatabase,
  value: ImportClassificationContextRequest,
): ImportClassificationContext {
  const parsed = importClassificationContextRequestSchema.safeParse(value)
  if (!parsed.success) {
    throw new DbError('INVALID_INPUT', 'Invalid import classification context.')
  }
  const input = parsed.data
  return db.transaction(() => {
    const vocabulary = db
      .select()
      .from(recognitionVocabulary)
      .orderBy(recognitionVocabulary.key)
      .limit(10001)
      .all()
    const aliases = db
      .select()
      .from(recognitionAliases)
      .orderBy(recognitionAliases.id)
      .limit(10001)
      .all()
    if (vocabulary.length > 10000 || aliases.length > 10000) {
      throw new DbError(
        'INVALID_INPUT',
        'Classification vocabulary exceeds its safety limit.',
      )
    }
    const token = createHash('sha256')
      .update(JSON.stringify([vocabulary, aliases]))
      .digest('hex')
    if (input.token && input.token !== token) {
      throw new DbError(
        'STALE_REVIEW',
        'Classification vocabulary changed. Prepare suggestions again.',
      )
    }
    const targets: ImportClassificationContext['targets'] = input.targets.map(
      (target) => {
        const record =
          target.kind === 'sample'
            ? db
                .select({ currentType: samples.sampleType })
                .from(samples)
                .where(eq(samples.id, target.id))
                .get()
            : db
                .select({ id: packs.id })
                .from(packs)
                .where(eq(packs.id, target.id))
                .get()
        if (!record) {
          throw new DbError(
            'STALE_REVIEW',
            'A classification target no longer exists.',
          )
        }
        const instruments =
          target.kind === 'sample'
            ? db
                .select({ id: sampleInstruments.instrumentId })
                .from(sampleInstruments)
                .where(eq(sampleInstruments.sampleId, target.id))
                .limit(1001)
                .all()
            : db
                .select({ id: packInstruments.instrumentId })
                .from(packInstruments)
                .where(eq(packInstruments.packId, target.id))
                .limit(1001)
                .all()
        const genres =
          target.kind === 'sample'
            ? db
                .select({ id: sampleGenres.genreId })
                .from(sampleGenres)
                .where(eq(sampleGenres.sampleId, target.id))
                .limit(1001)
                .all()
            : db
                .select({ id: packGenres.genreId })
                .from(packGenres)
                .where(eq(packGenres.packId, target.id))
                .limit(1001)
                .all()
        if (instruments.length + genres.length > 1000) {
          throw new DbError(
            'INVALID_INPUT',
            'Classification assignments exceed their safety limit.',
          )
        }
        const assignments: ImportClassificationContext['targets'][number]['assignments'] =
          []
        for (const [dimension, rows] of [
          ['instrument', instruments],
          ['genre', genres],
        ] as const) {
          for (const row of rows) {
            const entry = vocabulary.find(
              (item) =>
                item.state === 'active' &&
                item.dimension === dimension &&
                (dimension === 'instrument'
                  ? item.instrumentId
                  : item.genreId) === row.id,
            )
            if (!entry) {
              throw new DbError(
                'DB_INTEGRITY',
                'Classification vocabulary mapping is missing.',
              )
            }
            assignments.push({ dimension, key: entry.key })
          }
        }
        assignments.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
        return {
          target,
          currentType: 'currentType' in record ? record.currentType : null,
          assignments,
        }
      },
    )
    const result: ImportClassificationContext = {
      token,
      vocabulary: vocabulary
        .slice(input.offset, input.offset + 100)
        .map((entry) => ({
          key: entry.key,
          dimension: entry.dimension,
          name: entry.name,
          entityId: entry.instrumentId ?? entry.genreId,
          state: entry.state,
        })),
      aliases: aliases
        .slice(input.offset, input.offset + 100)
        .filter((alias) => !alias.deleted)
        .map((alias) => ({
          id: alias.id,
          targetKey: alias.targetKey,
          term: alias.term,
          suppliedKey: alias.suppliedKey,
        })),
      vocabularyTotal: vocabulary.length,
      aliasTotal: aliases.length,
      targets,
    }
    if (Buffer.byteLength(JSON.stringify(result)) > 8 * 1024 * 1024) {
      throw new DbError(
        'INVALID_INPUT',
        'Classification context exceeds its safety limit.',
      )
    }
    return result
  })
}
