import { useEffect, useState } from 'react'
import { unwrapIpcResult } from '@shared/ipc/result'
import type { LibraryPage } from '@shared/ipc/library'

export function useCatalog(
  favoritesOnly: boolean,
  revision: number,
): {
  page: LibraryPage | null
  loading: boolean
  error: string | null
  load: (offset: number) => void
  refresh: () => void
} {
  const [page, setPage] = useState<LibraryPage | null>(null)
  const [request, setRequest] = useState({ offset: 0, version: 0 })
  const [completion, setCompletion] = useState<{
    request: typeof request
    revision: number
    favoritesOnly: boolean
    error: string | null
  } | null>(null)
  const loading =
    completion?.request !== request ||
    completion.revision !== revision ||
    completion.favoritesOnly !== favoritesOnly
  const error = loading ? null : (completion?.error ?? null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        let next = unwrapIpcResult(
          await window.api.library.list({
            favoritesOnly,
            offset: request.offset,
          }),
        )
        // Removing the final Favorite on a page must not strand the view beyond its results.
        if (next.offset > 0 && next.items.length === 0) {
          next = unwrapIpcResult(
            await window.api.library.list({
              favoritesOnly,
              offset: Math.max(
                0,
                Math.floor((next.total - 1) / next.limit) * next.limit,
              ),
            }),
          )
        }
        if (active) {
          setPage(next)
          setCompletion({ request, revision, favoritesOnly, error: null })
        }
      } catch (reason) {
        if (active) {
          setCompletion({
            request,
            revision,
            favoritesOnly,
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
  }, [favoritesOnly, revision, request])

  return {
    page,
    loading,
    error,
    load: (offset) =>
      setRequest((current) => ({ offset, version: current.version + 1 })),
    refresh: () =>
      setRequest((current) => ({ ...current, version: current.version + 1 })),
  }
}
