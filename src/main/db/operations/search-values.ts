import { inArray, sql } from 'drizzle-orm'
import type { SQL, SQLWrapper } from 'drizzle-orm'
import type { AppDatabase } from '../runtime/connection.ts'
import { sampleSources, samples } from '../schema/samples.ts'

// The materialized search columns exist so the catalog never evaluates a JS
// function per row. Each value depends only on the row that stores it, which is
// what makes materializing safe: anything that can change per query (which root
// is registered, and which one the catalog displays) stays a live decision.
const sourceSearchValues = {
  searchFilename: sql`kiter_search_text(kiter_filename(${sampleSources.canonicalPath}))`,
}

/** A Sample's relative path under one root. Stable for that association. */
export function storedRelativePath(
  root: SQLWrapper | string,
  file: SQLWrapper | string,
): SQL {
  return sql`kiter_search_text(kiter_relative_path(${file}, ${root}))`
}

/**
 * The Sample's searchable name. Accepts the new presentation name so a rename can
 * set it inline, or the column itself so a refresh keeps whatever name is stored.
 */
export function sampleSearchName(name: string | null | SQLWrapper): SQL {
  return sql`kiter_search_text(coalesce(${name}, (SELECT kiter_filename(${sampleSources.canonicalPath}) FROM ${sampleSources} WHERE ${sampleSources.sampleId} = ${samples.id})))`
}

// A folder can hold thousands of files, and every bound id is an SQL variable,
// so statements are chunked well under SQLite's limit.
const REFRESH_CHUNK_SIZE = 400

/**
 * Recomputes the search values a Sample owns, for the given Samples.
 *
 * Call this after inserting or relocating their sources. Renaming goes through
 * {@link sampleSearchName} inline instead, and the relative path is written with
 * its association, so a presentation edit never rewrites the source row.
 */
export function refreshSampleSearch(
  db: Pick<AppDatabase, 'update'>,
  sampleIds: readonly string[],
): void {
  for (let start = 0; start < sampleIds.length; start += REFRESH_CHUNK_SIZE) {
    const ids = sampleIds.slice(start, start + REFRESH_CHUNK_SIZE)
    db.update(sampleSources)
      .set(sourceSearchValues)
      .where(inArray(sampleSources.sampleId, ids))
      .run()
    db.update(samples)
      .set({ searchName: sampleSearchName(samples.displayName) })
      .where(inArray(samples.id, ids))
      .run()
  }
}
