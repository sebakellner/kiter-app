import { and, count, eq, inArray, or, sql, type SQL } from 'drizzle-orm'
import { instruments, sampleInstruments } from '../../schema/classification.ts'
import { genres, sampleGenres } from '../../schema/recognition.ts'
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
// Canonical paths are host-native; backslashes are valid filename characters on POSIX.
const normalizedPath =
  process.platform === 'win32'
    ? sql`replace(${sampleSources.canonicalPath}, char(92), '/')`
    : sql`${sampleSources.canonicalPath}`
// Strip everything through the last slash; rtrim removes the non-slash suffix.
const filename = sql<string>`substr(${normalizedPath}, length(rtrim(${normalizedPath}, replace(${normalizedPath}, '/', ''))) + 1)`
const relativePath = sql<string>`kiter_relative_path(${sampleSources.canonicalPath}, ${rootPath})`
const searchName = sql`kiter_search_text(coalesce(${samples.displayName}, ${filename}))`
const searchFilename = sql`kiter_search_text(${filename})`
const searchPath = sql`kiter_search_text(${relativePath})`
const fields = {
  id: samples.id,
  favorite: samples.favorite,
  name: sql<string>`coalesce(${samples.displayName}, ${filename})`,
  path: sampleSources.canonicalPath,
  rootPath,
  relativePath,
  sourceRevision: sampleSources.revision,
}

function buildSearchFilter(search: string | undefined): SQL | undefined {
  // The request validator collapses whitespace and removes ineffective searches.
  return and(
    ...(search ? search.split(' ') : []).map((word) =>
      or(
        sql`instr(${searchName}, ${word}) > 0`,
        sql`instr(${searchFilename}, ${word}) > 0`,
        sql`instr(${searchPath}, ${word}) > 0`,
        sql`exists (select 1 from ${sampleInstruments}
          inner join ${instruments} on ${instruments.id} = ${sampleInstruments.instrumentId}
          where ${sampleInstruments.sampleId} = ${samples.id}
          and instr(kiter_search_text(${instruments.name}), ${word}) > 0)`,
        sql`exists (select 1 from ${sampleGenres}
          inner join ${genres} on ${genres.id} = ${sampleGenres.genreId}
          where ${sampleGenres.sampleId} = ${samples.id}
          and instr(kiter_search_text(${genres.name}), ${word}) > 0)`,
      ),
    ),
  )
}

function buildCatalogFilter({
  search,
  favoritesOnly,
  instrumentIds,
  genreIds,
  sampleTypes,
}: LibraryListRequest): SQL | undefined {
  return and(
    buildSearchFilter(search),
    favoritesOnly ? eq(samples.favorite, true) : undefined,
    sampleTypes?.length
      ? inArray(sql`coalesce(${samples.sampleType}, 'unknown')`, sampleTypes)
      : undefined,
    instrumentIds?.length
      ? sql`exists (select 1 from ${sampleInstruments} where ${sampleInstruments.sampleId} = ${samples.id} and ${inArray(sampleInstruments.instrumentId, instrumentIds)})`
      : undefined,
    genreIds?.length
      ? sql`exists (select 1 from ${sampleGenres} where ${sampleGenres.sampleId} = ${samples.id} and ${inArray(sampleGenres.genreId, genreIds)})`
      : undefined,
  )
}

function buildSearchRank(search: string | undefined): SQL | undefined {
  return search
    ? sql`case
        when ${searchName} = ${search} or ${searchFilename} = ${search} then 0
        when instr(${searchName}, ${search}) = 1 or instr(${searchFilename}, ${search}) = 1 then 1
        when instr(${searchName}, ${search}) > 0 or instr(${searchFilename}, ${search}) > 0 then 2
        else 3 end`
    : undefined
}

export function listCatalogSamples(
  db: AppDatabase,
  input: LibraryListRequest,
): Page<CatalogSample> {
  const request = requireLibraryListRequest(input)
  const { limit = 50, offset = 0, search } = request
  const filter = buildCatalogFilter(request)
  const rank = buildSearchRank(search)
  return db.transaction(() => {
    const total = db
      .select({ value: count() })
      .from(samples)
      .innerJoin(sampleSources, eq(sampleSources.sampleId, samples.id))
      .where(filter)
      .get()!.value
    const rows = db
      .select(fields)
      .from(samples)
      .innerJoin(sampleSources, eq(sampleSources.sampleId, samples.id))
      .where(filter)
      .orderBy(
        ...(rank
          ? [rank, searchName]
          : [sql`lower(coalesce(${samples.displayName}, ${filename}))`]),
        sampleSources.canonicalPath,
        samples.id,
      )
      .limit(limit)
      .offset(offset)
      .all()
    return { items: rows, total, limit, offset }
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
  return row
}
