import { and, or, sql } from 'drizzle-orm'
import type { SQL, SQLWrapper } from 'drizzle-orm'

type SearchFields = readonly [SQLWrapper, ...SQLWrapper[]]

/**
 * "All query words must match, potentially in different searchable fields"
 * (`search.md`): each word has to appear in at least one field, not the whole
 * phrase in one field.
 */
export function buildSearchFilter(fields: SearchFields, query: string): SQL {
  return and(
    ...query
      .split(' ')
      .map((word) =>
        or(...fields.map((field) => sql`instr(${field}, ${word}) > 0`)),
      ),
  )!
}

/**
 * "Rank exact names first, then name prefixes/substrings, other text/relation
 * matches" (`search.md`). Every name is a materialized normalized value, or a
 * normalized name over a small table, so the comparison stays in SQLite.
 *
 * Callers keep the last tier for matches that only reach a Sample's path or an
 * assigned classification name. Samples rank with this shape through
 * `listCatalogSamples`, which keeps its private copy of it.
 */
export function buildSearchRank(names: SearchFields, query: string): SQL {
  const anyName = (compare: (name: SQLWrapper) => SQL): SQL =>
    or(...names.map(compare))!
  return sql`case
    when ${anyName((name) => sql`${name} = ${query}`)} then 0
    when ${anyName((name) => sql`instr(${name}, ${query}) = 1`)} then 1
    when ${anyName((name) => sql`instr(${name}, ${query}) > 0`)} then 2
    else 3 end`
}
