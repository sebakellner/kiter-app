import { useEffect, useRef, useState } from 'react'
import { unwrapIpcResult } from '@shared/ipc/result'
import type { LibraryPage } from '@shared/ipc/library'
import type { SampleTypeFilter } from '@shared/features/library/schemas'
import { effectiveCatalogSearch } from '@shared/features/library/search'

export function useCatalog(
  favoritesOnly: boolean,
  revision: number,
  initialOffset = 0,
  instrumentIds: string[] = [],
  genreIds: string[] = [],
  sampleTypes: SampleTypeFilter = [],
  search = '',
  collectionId?: string,
): {
  page: LibraryPage | null
  loading: boolean
  error: string | null
  load: (offset: number) => void
  refresh: () => void
} {
  const [page, setPage] = useState<LibraryPage | null>(null)
  const text = effectiveCatalogSearch(search)
  const dispatchedSearch = useRef(text)
  const filterKey = JSON.stringify([
    instrumentIds.slice().sort(),
    genreIds.slice().sort(),
    sampleTypes.slice().sort(),
    text,
    collectionId ?? null,
  ])
  const [request, setRequest] = useState({
    offset: initialOffset,
    version: 0,
    filterKey,
  })
  // Returning to earlier criteria (for example Clear search) must also start at page one.
  if (request.filterKey !== filterKey) {
    setRequest({ offset: 0, version: request.version, filterKey })
  }
  const [completion, setCompletion] = useState<{
    request: typeof request
    revision: number
    favoritesOnly: boolean
    filterKey: string
    error: string | null
  } | null>(null)
  const loading =
    completion?.request !== request ||
    completion.revision !== revision ||
    completion.favoritesOnly !== favoritesOnly ||
    completion.filterKey !== filterKey
  const error = loading ? null : (completion?.error ?? null)

  useEffect(() => {
    let active = true
    const [instruments, genres, types, query, collection]: [
      string[],
      string[],
      SampleTypeFilter,
      string,
      string | null,
    ] = JSON.parse(filterKey)
    const filters = {
      ...(instruments.length ? { instrumentIds: instruments } : {}),
      ...(genres.length ? { genreIds: genres } : {}),
      ...(types.length ? { sampleTypes: types } : {}),
      ...(query ? { search: query } : {}),
      ...(collection ? { collectionId: collection } : {}),
    }
    const offset = request.filterKey !== filterKey ? 0 : request.offset
    const run = async (): Promise<void> => {
      dispatchedSearch.current = query
      try {
        let next = unwrapIpcResult(
          await window.api.library.list({
            favoritesOnly,
            ...filters,
            offset,
          }),
        )
        if (!active) {
          return
        }
        // Removing the final Favorite on a page must not strand the view beyond its results.
        if (next.offset > 0 && next.items.length === 0) {
          next = unwrapIpcResult(
            await window.api.library.list({
              favoritesOnly,
              ...filters,
              offset: Math.max(
                0,
                Math.floor((next.total - 1) / next.limit) * next.limit,
              ),
            }),
          )
        }
        if (active) {
          setPage(next)
          setCompletion({
            request,
            revision,
            favoritesOnly,
            filterKey,
            error: null,
          })
        }
      } catch (reason) {
        if (active) {
          setCompletion({
            request,
            revision,
            favoritesOnly,
            filterKey,
            error:
              reason instanceof Error
                ? reason.message
                : 'Unable to load samples.',
          })
        }
      }
    }
    const timer =
      query && dispatchedSearch.current !== query
        ? setTimeout(() => void run(), 250)
        : undefined
    if (timer === undefined) {
      void run()
    }
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [favoritesOnly, revision, request, filterKey])

  return {
    page,
    loading,
    error,
    load: (offset) =>
      setRequest((current) => ({
        offset,
        version: current.version + 1,
        filterKey,
      })),
    refresh: () =>
      setRequest((current) => ({ ...current, version: current.version + 1 })),
  }
}
