import { useEffect, useState } from 'react'
import type {
  CollectionPage,
  CollectionSummary,
} from '@shared/domain/collection'
import { unwrapIpcResult } from '@shared/ipc/result'

export function useCollections(initialOffset: number): {
  page: CollectionPage<CollectionSummary> | null
  loading: boolean
  error: string | null
  load: (offset: number) => void
  refresh: () => void
} {
  const [request, setRequest] = useState({ offset: initialOffset, version: 0 })
  const [page, setPage] = useState<CollectionPage<CollectionSummary> | null>(
    null,
  )
  const [completion, setCompletion] = useState<{
    request: typeof request
    error: string | null
  } | null>(null)
  const loading = completion?.request !== request
  useEffect(() => {
    let active = true
    async function run(): Promise<void> {
      try {
        let next = unwrapIpcResult(
          await window.api.collections.list({ offset: request.offset }),
        )
        if (!active) {
          return
        }
        if (next.offset > 0 && next.items.length === 0) {
          next = unwrapIpcResult(
            await window.api.collections.list({
              offset: Math.max(
                0,
                Math.floor((next.total - 1) / next.limit) * next.limit,
              ),
            }),
          )
        }
        if (active) {
          setPage(next)
          setCompletion({ request, error: null })
        }
      } catch (reason) {
        if (active) {
          setCompletion({
            request,
            error:
              reason instanceof Error
                ? reason.message
                : 'Unable to load Collections.',
          })
        }
      }
    }
    void run()
    return () => {
      active = false
    }
  }, [request])
  return {
    page,
    loading,
    error: loading ? null : (completion?.error ?? null),
    load: (offset) =>
      setRequest((current) => ({ offset, version: current.version + 1 })),
    refresh: () =>
      setRequest((current) => ({ ...current, version: current.version + 1 })),
  }
}
