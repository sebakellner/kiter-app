import { useEffect, useState } from 'react'
import type { PackSamplesPage } from '@shared/ipc/packs'
import { unwrapIpcResult } from '@shared/ipc/result'

export function usePackSamples(
  id: string,
  initialOffset = 0,
): {
  page: PackSamplesPage | null
  loading: boolean
  error: string | null
  load: (offset: number) => void
  refresh: () => void
} {
  const [request, setRequest] = useState({
    id,
    offset: initialOffset,
    version: 0,
  })
  const [page, setPage] = useState<PackSamplesPage | null>(null)
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
          await window.api.packs.samples({
            id: request.id,
            offset: request.offset,
          }),
        )
        if (!active) {
          return
        }
        // A page beyond the remaining Samples must not strand the view; fall
        // back to the page that still holds the last result.
        if (next.offset > 0 && next.items.length === 0) {
          next = unwrapIpcResult(
            await window.api.packs.samples({
              id: request.id,
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
                : 'Unable to load Pack Samples.',
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
      setRequest((current) => ({
        id: current.id,
        offset,
        version: current.version + 1,
      })),
    refresh: () =>
      setRequest((current) => ({ ...current, version: current.version + 1 })),
  }
}
