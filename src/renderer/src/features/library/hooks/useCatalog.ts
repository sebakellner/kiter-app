import { useEffect, useState } from 'react'
import { unwrapIpcResult } from '@shared/ipc/result'
import type { LibraryPage } from '@shared/ipc/library'

export function useCatalog(
  favoritesOnly: boolean,
  revision: number,
  initialOffset = 0,
  categoryIds: string[] = [],
  genreIds: string[] = [],
): {
  page: LibraryPage | null
  loading: boolean
  error: string | null
  load: (offset: number) => void
  refresh: () => void
} {
  const [page, setPage] = useState<LibraryPage | null>(null)
  const filterKey = JSON.stringify([
    categoryIds.slice().sort(),
    genreIds.slice().sort(),
  ])
  const [request, setRequest] = useState({
    offset: initialOffset,
    version: 0,
    filterKey,
  })
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
    const [categories, genres]: [string[], string[]] = JSON.parse(filterKey)
    const filters = {
      ...(categories.length ? { categoryIds: categories } : {}),
      ...(genres.length ? { genreIds: genres } : {}),
    }
    const offset = request.filterKey !== filterKey ? 0 : request.offset
    void (async () => {
      try {
        let next = unwrapIpcResult(
          await window.api.library.list({
            favoritesOnly,
            ...filters,
            offset,
          }),
        )
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
    })()
    return () => {
      active = false
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
