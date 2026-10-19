import { useEffect, useState } from 'react'
import type { CollectionSummary } from '@shared/domain/collection'

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
