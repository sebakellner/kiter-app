import { sql } from 'drizzle-orm'
import type { AppDatabase } from '../../runtime/connection.ts'
import { authors, instruments } from '../../schema/classification.ts'
import { collections } from '../../schema/collections.ts'
import { packs } from '../../schema/packs.ts'
import { genres } from '../../schema/recognition.ts'
import {
  SUGGESTION_KINDS,
  SUGGESTION_LIMIT,
  requireSearchSuggestRequest,
  type SearchSuggestion,
  type SearchSuggestionGroup,
  type SearchSuggestRequest,
  type SearchSuggestResponse,
} from '../../../../shared/ipc/search.ts'
import { listCatalogSamples } from '../samples/catalog.ts'
import { buildSearchFilter, buildSearchRank } from './rank.ts'

// Packs and Collections store no materialized normalized name, so their own
// small table normalizes the name per row (`listCollectionDestinations` does
// the same): one Pack per source root, and Collections only by user action.
const packName = sql<string>`kiter_search_text(${packs.name})`
const collectionName = sql<string>`kiter_search_text(${collections.name})`
// `name_key` is NFC and lowercase but keeps accents (`normalizeName`), so it
// cannot answer an accent-insensitive query on its own. Classification tables
// hold user/vocabulary rows, not the library, so normalizing them per row stays
// bounded here as it does for Packs and Collections.
const instrumentName = sql<string>`kiter_search_text(${instruments.nameKey})`
const authorName = sql<string>`kiter_search_text(${authors.nameKey})`
const genreName = sql<string>`kiter_search_text(${genres.nameKey})`

/**
 * A Sample's `detail` is the relative source path the catalog shows, when it
 * has one. Its group reuses the Samples list, which already ranks exact names,
 * then name/filename prefixes and substrings, then other all-word path and
 * assigned Instrument/Genre matches.
 */
function sampleSuggestions(db: AppDatabase, query: string): SearchSuggestion[] {
  return listCatalogSamples(db, {
    search: query,
    limit: SUGGESTION_LIMIT,
  }).items.map(({ id, name, relativePath }): SearchSuggestion => ({
    kind: 'sample',
    id,
    name,
    ...(relativePath ? { detail: relativePath } : {}),
  }))
}

function packSuggestions(db: AppDatabase, query: string): SearchSuggestion[] {
  return db
    .select({ id: packs.id, name: packs.name })
    .from(packs)
    .where(buildSearchFilter([packName], query))
    .orderBy(buildSearchRank([packName], query), packName, packs.id)
    .limit(SUGGESTION_LIMIT)
    .all()
    .map((row): SearchSuggestion => ({ kind: 'pack', ...row }))
}

function collectionSuggestions(
  db: AppDatabase,
  query: string,
): SearchSuggestion[] {
  return db
    .select({ id: collections.id, name: collections.name })
    .from(collections)
    .where(buildSearchFilter([collectionName], query))
    .orderBy(
      buildSearchRank([collectionName], query),
      collectionName,
      collections.id,
    )
    .limit(SUGGESTION_LIMIT)
    .all()
    .map((row): SearchSuggestion => ({ kind: 'collection', ...row }))
}

function instrumentSuggestions(
  db: AppDatabase,
  query: string,
): SearchSuggestion[] {
  return db
    .select({ id: instruments.id, name: instruments.name })
    .from(instruments)
    .where(buildSearchFilter([instrumentName], query))
    .orderBy(
      buildSearchRank([instrumentName], query),
      instrumentName,
      instruments.id,
    )
    .limit(SUGGESTION_LIMIT)
    .all()
    .map((row): SearchSuggestion => ({ kind: 'instrument', ...row }))
}

function authorSuggestions(db: AppDatabase, query: string): SearchSuggestion[] {
  return db
    .select({ id: authors.id, name: authors.name })
    .from(authors)
    .where(buildSearchFilter([authorName], query))
    .orderBy(buildSearchRank([authorName], query), authorName, authors.id)
    .limit(SUGGESTION_LIMIT)
    .all()
    .map((row): SearchSuggestion => ({ kind: 'author', ...row }))
}

function genreSuggestions(db: AppDatabase, query: string): SearchSuggestion[] {
  return db
    .select({ id: genres.id, name: genres.name })
    .from(genres)
    .where(buildSearchFilter([genreName], query))
    .orderBy(buildSearchRank([genreName], query), genreName, genres.id)
    .limit(SUGGESTION_LIMIT)
    .all()
    .map((row): SearchSuggestion => ({ kind: 'genre', ...row }))
}

const namedSuggestions = {
  pack: packSuggestions,
  collection: collectionSuggestions,
  instrument: instrumentSuggestions,
  author: authorSuggestions,
  genre: genreSuggestions,
} as const

/**
 * One bounded request for every entity kind: at most `SUGGESTION_LIMIT` items
 * per nonempty group, in `SUGGESTION_KINDS` order, echoing the query. The
 * renderer never queries per kind.
 */
export function searchSuggest(
  db: AppDatabase,
  input: SearchSuggestRequest,
): SearchSuggestResponse {
  const { query } = requireSearchSuggestRequest(input)
  const groups: SearchSuggestionGroup[] = []
  for (const kind of SUGGESTION_KINDS) {
    const items =
      kind === 'sample'
        ? sampleSuggestions(db, query)
        : namedSuggestions[kind](db, query)
    if (items.length > 0) {
      groups.push({ kind, items })
    }
  }
  return { query, groups }
}
