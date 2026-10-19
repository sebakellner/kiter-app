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

export function useCollectionDetail(id: string): {
  collection: CollectionSummary | null
  loading: boolean
  error: string | null
  unavailable: boolean
  refresh: () => void
} {
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<{
    id: string
    version: number
    collection: CollectionSummary | null
    error: string | null
    unavailable: boolean
  } | null>(null)
  useEffect(() => {
    let active = true
    async function run(): Promise<void> {
      try {
        const result = await window.api.collections.get({ id })
        if (!active) {
          return
        }
        if (result.ok) {
          setState({
            id,
            version,
            collection: result.data,
            error: null,
            unavailable: false,
          })
        } else {
          setState((current) => ({
            id,
            version,
            collection:
              result.error.code === 'NOT_FOUND' ||
              result.error.code === 'INVALID_INPUT'
                ? null
                : current?.id === id
                  ? current.collection
                  : null,
            error: result.error.message,
            unavailable:
              result.error.code === 'NOT_FOUND' ||
              result.error.code === 'INVALID_INPUT',
          }))
        }
      } catch (reason) {
        if (active) {
          setState((current) => ({
            id,
            version,
            collection: current?.id === id ? current.collection : null,
            error:
              reason instanceof Error
                ? reason.message
                : 'Unable to load the Collection.',
            unavailable: false,
          }))
        }
      }
    }
    void run()
    return () => {
      active = false
    }
  }, [id, version])
  const current = state?.id === id ? state : null
  return {
    collection: current?.collection ?? null,
    loading: !current || current.version !== version,
    error: current?.version === version ? current.error : null,
    unavailable: current?.unavailable ?? false,
    refresh: () => setVersion((current) => current + 1),
  }
}
