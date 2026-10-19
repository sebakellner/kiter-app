import path from 'node:path'
import { and, count, eq, inArray, sql } from 'drizzle-orm'
import { sampleCategories } from '../../schema/classification.ts'
import { sampleGenres } from '../../schema/recognition.ts'
import type { AppDatabase } from '../../runtime/connection.ts'
import {
  samples,
  sampleSources,
  sourceRootSamples,
} from '../../schema/samples.ts'
import { sourceRoots } from '../../schema/sources.ts'
import {
  requireLibraryListRequest,
  type CatalogSample,
  type LibraryListRequest,
} from '../../../../shared/ipc/library.ts'
import type { Page } from '../../../../shared/domain/pagination.ts'
import { requireEntityId } from '../../../../shared/domain/validation.ts'
import { DbError } from '../../errors.ts'

// Root associations are discovery evidence; current containment is checked in main.
const rootPath = sql<string | null>`(SELECT min(${sourceRoots.canonicalPath})
  FROM ${sourceRootSamples} INNER JOIN ${sourceRoots}
  ON ${sourceRoots.id} = ${sourceRootSamples.sourceRootId}
  WHERE ${sourceRootSamples.sampleId} = ${samples.id} AND ${sourceRoots.registered} = 1)`
const normalizedPath =
  process.platform === 'win32'
    ? sql`replace(${sampleSources.canonicalPath}, char(92), '/')`
    : sql`${sampleSources.canonicalPath}`
const filename = sql<string>`substr(${normalizedPath}, length(rtrim(${normalizedPath}, replace(${normalizedPath}, '/', ''))) + 1)`
const fields = {
  id: samples.id,
  favorite: samples.favorite,
  name: sql<string>`coalesce(${samples.displayName}, ${filename})`,
  path: sampleSources.canonicalPath,
  rootPath,
  sourceRevision: sampleSources.revision,
}

function withRelativePath(
  row: Omit<CatalogSample, 'relativePath'>,
): CatalogSample {
  return {
    ...row,
    relativePath: row.rootPath
      ? path.relative(row.rootPath, row.path)
      : path.basename(row.path),
  }
}

export function listCatalogSamples(
  db: AppDatabase,
  input: LibraryListRequest,
): Page<CatalogSample> {
  const {
    limit = 50,
    offset = 0,
    favoritesOnly,
    categoryIds,
    genreIds,
    sampleTypes,
  } = requireLibraryListRequest(input)
  return db.transaction(() => {
    const categoryMatch = categoryIds?.length
      ? sql`exists (select 1 from ${sampleCategories} where ${sampleCategories.sampleId} = ${samples.id} and ${inArray(sampleCategories.categoryId, categoryIds)})`
      : undefined
    const filter = and(
      favoritesOnly ? eq(samples.favorite, true) : undefined,
      sampleTypes?.length
        ? inArray(sql`coalesce(${samples.sampleType}, 'unknown')`, sampleTypes)
        : undefined,
      categoryMatch,
      genreIds?.length
        ? sql`exists (select 1 from ${sampleGenres} where ${sampleGenres.sampleId} = ${samples.id} and ${inArray(sampleGenres.genreId, genreIds)})`
        : undefined,
    )
    const total = db
      .select({ value: count() })
      .from(samples)
      .where(filter)
      .get()!.value
    const rows = db
      .select(fields)
      .from(samples)
      .innerJoin(sampleSources, eq(sampleSources.sampleId, samples.id))
      .where(filter)
      .orderBy(
        sql`lower(coalesce(${samples.displayName}, ${filename}))`,
        sampleSources.canonicalPath,
        samples.id,
      )
      .limit(limit)
      .offset(offset)
      .all()
    return { items: rows.map(withRelativePath), total, limit, offset }
  })
}

export function getCatalogSample(db: AppDatabase, id: string): CatalogSample {
  requireEntityId(id)
  const row = db
    .select(fields)
    .from(samples)
    .innerJoin(sampleSources, eq(sampleSources.sampleId, samples.id))
    .where(eq(samples.id, id))
    .get()
  if (!row) {
    throw new DbError('NOT_FOUND', 'The Sample no longer exists.')
  }
  return withRelativePath(row)
}
