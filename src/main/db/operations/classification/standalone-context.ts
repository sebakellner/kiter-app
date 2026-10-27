import { createHash } from 'node:crypto'
import path from 'node:path'
import { and, eq } from 'drizzle-orm'
import type { AppDatabase } from '../../runtime/connection.ts'
import { DbError } from '../../errors.ts'
import {
  standaloneClassificationContextRequestSchema,
  type StandaloneClassificationContext,
  type StandaloneClassificationContextRequest,
  type StandaloneClassificationContextTarget,
} from '../../../../shared/features/classification/standalone-context-schemas.ts'
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
import {
  samples,
  sampleSources,
  sourceRootSamples,
} from '../../schema/samples.ts'
import { sourceRoots } from '../../schema/sources.ts'
import { packs } from '../../schema/packs.ts'

const MAX_VOCABULARY = 10000
const MAX_SOURCES = 100
const MAX_ASSIGNMENTS = 1000
const MAX_SERIALIZED_BYTES = 8 * 1024 * 1024

type Vocabulary = (typeof recognitionVocabulary.$inferSelect)[]
type Target = StandaloneClassificationContextRequest['targets'][number]
type ContextTarget = StandaloneClassificationContextTarget

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// Saved Instrument/Genre assignments bind active vocabulary keys, exactly like
// the import classification context; a missing active mapping is corruption.
function readAssignments(
  db: AppDatabase,
  vocabulary: Vocabulary,
  target: Target,
): { assignments: ContextTarget['assignments']; genreIds: string[] } {
  const instruments =
    target.kind === 'sample'
      ? db
          .select({ id: sampleInstruments.instrumentId })
          .from(sampleInstruments)
          .where(eq(sampleInstruments.sampleId, target.id))
          .limit(MAX_ASSIGNMENTS + 1)
          .all()
      : db
          .select({ id: packInstruments.instrumentId })
          .from(packInstruments)
          .where(eq(packInstruments.packId, target.id))
          .limit(MAX_ASSIGNMENTS + 1)
          .all()
  const genres =
    target.kind === 'sample'
      ? db
          .select({ id: sampleGenres.genreId })
          .from(sampleGenres)
          .where(eq(sampleGenres.sampleId, target.id))
          .limit(MAX_ASSIGNMENTS + 1)
          .all()
      : db
          .select({ id: packGenres.genreId })
          .from(packGenres)
          .where(eq(packGenres.packId, target.id))
          .limit(MAX_ASSIGNMENTS + 1)
          .all()
  if (instruments.length + genres.length > MAX_ASSIGNMENTS) {
    throw new DbError(
      'INVALID_INPUT',
      'Classification assignments exceed their safety limit.',
    )
  }
  const assignments: ContextTarget['assignments'] = []
  for (const [dimension, rows] of [
    ['instrument', instruments],
    ['genre', genres],
  ] as const) {
    for (const row of rows) {
      const entry = vocabulary.find(
        (item) =>
          item.state === 'active' &&
          item.dimension === dimension &&
          (dimension === 'instrument' ? item.instrumentId : item.genreId) ===
            row.id,
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
  assignments.sort((a, b) => compare(a.key, b.key))
  return { assignments, genreIds: genres.map((row) => row.id) }
}

// Origin Genre evidence maps through non-deleted vocabulary, mirroring the
// single-sample preparation; unmapped rows contribute no clue.
function genreKeys(vocabulary: Vocabulary, genreIds: string[]): string[] {
  return genreIds
    .flatMap((genreId) => {
      const entry = vocabulary.find(
        (item) => item.genreId === genreId && item.state !== 'deleted',
      )
      return entry ? [entry.key] : []
    })
    .sort(compare)
}

function readSampleTarget(
  db: AppDatabase,
  vocabulary: Vocabulary,
  target: Target,
): ContextTarget {
  const sample = db
    .select()
    .from(samples)
    .innerJoin(sampleSources, eq(samples.id, sampleSources.sampleId))
    .where(eq(samples.id, target.id))
    .get()
  if (!sample) {
    throw new DbError(
      'STALE_REVIEW',
      'A classification target no longer exists.',
    )
  }
  const { assignments } = readAssignments(db, vocabulary, target)
  // Registered root associations only; unregistered roots contribute no evidence.
  const roots = db
    .select({ id: sourceRoots.id, path: sourceRoots.canonicalPath })
    .from(sourceRootSamples)
    .innerJoin(sourceRoots, eq(sourceRoots.id, sourceRootSamples.sourceRootId))
    .where(
      and(
        eq(sourceRootSamples.sampleId, target.id),
        eq(sourceRoots.registered, true),
      ),
    )
    .orderBy(sourceRoots.id)
    .limit(MAX_SOURCES + 1)
    .all()
  if (roots.length > MAX_SOURCES) {
    throw new DbError(
      'INVALID_INPUT',
      'Classification sources exceed their safety limit.',
    )
  }
  const source = sample.sample_sources
  const sources: ContextTarget['sources'] = roots.flatMap((root) => {
    const relative = path.relative(root.path, source.canonicalPath)
    if (
      !relative ||
      path.isAbsolute(relative) ||
      relative === '..' ||
      relative.startsWith(`..${path.sep}`)
    ) {
      return []
    }
    return [
      {
        rootId: root.id,
        rootPath: root.path,
        relativePath: relative,
        availability: source.availability,
        canonicalPath: source.canonicalPath,
      },
    ]
  })
  const originGenres = sample.samples.packId
    ? db
        .select({ id: packGenres.genreId })
        .from(packGenres)
        .where(eq(packGenres.packId, sample.samples.packId))
        .orderBy(packGenres.genreId)
        .limit(MAX_ASSIGNMENTS + 1)
        .all()
    : []
  if (originGenres.length > MAX_ASSIGNMENTS) {
    throw new DbError(
      'INVALID_INPUT',
      'Classification origin Genres exceed their safety limit.',
    )
  }
  return {
    target,
    currentType: sample.samples.sampleType,
    assignments,
    sources,
    originPackId: sample.samples.packId,
    originGenreKeys: genreKeys(
      vocabulary,
      originGenres.map((row) => row.id),
    ),
  }
}

function readPackTarget(
  db: AppDatabase,
  vocabulary: Vocabulary,
  target: Target,
): ContextTarget {
  const pack = db.select().from(packs).where(eq(packs.id, target.id)).get()
  if (!pack) {
    throw new DbError(
      'STALE_REVIEW',
      'A classification target no longer exists.',
    )
  }
  const { assignments, genreIds } = readAssignments(db, vocabulary, target)
  const root = db
    .select()
    .from(sourceRoots)
    .where(
      and(
        eq(sourceRoots.id, pack.sourceRootId),
        eq(sourceRoots.registered, true),
      ),
    )
    .get()
  return {
    target,
    currentType: null,
    assignments,
    sources: root
      ? [
          {
            rootId: root.id,
            rootPath: root.canonicalPath,
            relativePath: '',
            availability: null,
            canonicalPath: root.canonicalPath,
          },
        ]
      : [],
    originPackId: null,
    originGenreKeys: genreKeys(vocabulary, genreIds),
  }
}

/** Bounded read transaction for the standalone catalog-backed review. The token
 * pins vocabulary/aliases across pages; targets always return complete. This
 * read never writes catalog data.
 */
export function readStandaloneClassificationContext(
  db: AppDatabase,
  value: StandaloneClassificationContextRequest,
): StandaloneClassificationContext {
  const parsed = standaloneClassificationContextRequestSchema.safeParse(value)
  if (!parsed.success) {
    throw new DbError(
      'INVALID_INPUT',
      'Invalid standalone classification context.',
    )
  }
  const input = parsed.data
  return db.transaction(() => {
    const vocabulary = db
      .select()
      .from(recognitionVocabulary)
      .orderBy(recognitionVocabulary.key)
      .limit(MAX_VOCABULARY + 1)
      .all()
    const aliases = db
      .select()
      .from(recognitionAliases)
      .orderBy(recognitionAliases.id)
      .limit(MAX_VOCABULARY + 1)
      .all()
    if (vocabulary.length > MAX_VOCABULARY || aliases.length > MAX_VOCABULARY) {
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
        'Classification vocabulary changed. Prepare the review again.',
      )
    }
    const targets: StandaloneClassificationContext['targets'] =
      input.targets.map((target) =>
        target.kind === 'sample'
          ? readSampleTarget(db, vocabulary, target)
          : readPackTarget(db, vocabulary, target),
      )
    const result: StandaloneClassificationContext = {
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
    if (Buffer.byteLength(JSON.stringify(result)) > MAX_SERIALIZED_BYTES) {
      throw new DbError(
        'INVALID_INPUT',
        'Classification context exceeds its safety limit.',
      )
    }
    return result
  })
}
