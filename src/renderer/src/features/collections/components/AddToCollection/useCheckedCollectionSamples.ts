import { useEffect, useState } from 'react'
import type { LibrarySample } from '@shared/ipc/library'
import { unwrapIpcResult } from '@shared/ipc/result'

export type CollectionSample = Pick<
  LibrarySample,
  'id' | 'name' | 'relativePath'
>

// Review checked identities independently of the current page and filters.
export function useCheckedCollectionSamples(
  samples: CollectionSample[],
  collectionId?: string,
): {
  samples: CollectionSample[]
  loading: boolean
  error: string | null
  missing: CollectionSample[]
  refresh: () => void
} {
  const [version, setVersion] = useState(0)
  const key = JSON.stringify([samples, collectionId, version])
  const [result, setResult] = useState<{
    samples: CollectionSample[]
    missing: CollectionSample[]
    error: string | null
    key: string
  } | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const ordered: CollectionSample[] = []
        let token: string | undefined
        for (let offset = 0; ; offset += 100) {
          const page = unwrapIpcResult(
            await window.api.library.list({
              sampleIds: samples.map(({ id }) => id),
              ...(collectionId ? { collectionId } : {}),
              limit: 100,
              offset,
            }),
          )
          if (!active) {
            return
          }
          if (offset > 0 && token !== page.collectionOrderToken) {
            throw new Error(
              'The source Collection changed. Review Samples again.',
            )
          }
          token = page.collectionOrderToken
          ordered.push(...page.items)
          if (offset + page.limit >= page.total) {
            break
          }
        }
        const ids = new Set(ordered.map(({ id }) => id))
        if (ids.size !== ordered.length) {
          throw new Error('The source list changed. Review Samples again.')
        }
        setResult({
          samples: ordered,
          missing: samples.filter(({ id }) => !ids.has(id)),
          error: null,
          key,
        })
      } catch (reason) {
        if (active) {
          setResult({
            samples: [],
            missing: [],
            error:
              reason instanceof Error
                ? reason.message
                : 'Unable to review Samples.',
            key,
          })
        }
      }
    })()
    return () => {
      active = false
    }
  }, [samples, collectionId, key])

  return {
    samples: result?.samples ?? [],
    missing: result?.missing ?? [],
    loading: result?.key !== key,
    error: result?.key === key ? result.error : null,
    refresh: () => setVersion((current) => current + 1),
  }
}
