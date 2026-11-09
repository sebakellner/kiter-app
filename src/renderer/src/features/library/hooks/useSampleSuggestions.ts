import { useEffect, useRef, useState } from 'react'
import { unwrapIpcResult } from '@shared/ipc/result'
import type { CatalogSample } from '@shared/ipc/library'
import { effectiveCatalogSearch } from '@shared/features/library/search'

/** Search guide: at most five suggestions per entity type. */
export const SAMPLE_SUGGESTION_LIMIT = 5

/** Search guide: wait 250 ms after typing stops. */
const SUGGESTION_DELAY = 250

type Completion = {
  text: string
  revision: number
  attempt: number
  items: CatalogSample[]
  error: string | null
}

/**
 * Bounded Sample suggestions for the header search. The query reuses the
 * catalog list request, so only Samples can be suggested in this slice.
 */
export function useSampleSuggestions(
  query: string,
  revision: number,
): {
  suggestions: CatalogSample[]
  loading: boolean
  error: string | null
  retry: () => void
} {
  const text = effectiveCatalogSearch(query)
  const [attempt, setAttempt] = useState(0)
  const [completion, setCompletion] = useState<Completion | null>(null)
  const dispatched = useRef(text)
  const settled =
    completion !== null &&
    completion.text === text &&
    completion.revision === revision &&
    completion.attempt === attempt
  const loading = text !== '' && !settled

  useEffect(() => {
    if (text === '') {
      dispatched.current = ''
      return
    }
    let active = true
    const run = async (): Promise<void> => {
      dispatched.current = text
      try {
        const page = unwrapIpcResult(
          await window.api.library.list({
            search: text,
            limit: SAMPLE_SUGGESTION_LIMIT,
          }),
        )
        if (active) {
          setCompletion({
            text,
            revision,
            attempt,
            items: page.items,
            error: null,
          })
        }
      } catch (reason) {
        if (active) {
          setCompletion({
            text,
            revision,
            attempt,
            items: [],
            error:
              reason instanceof Error
                ? reason.message
                : 'Unable to search samples.',
          })
        }
      }
    }
    // Only a changed query waits; a retry of the same query runs immediately.
    const timer =
      dispatched.current !== text
        ? setTimeout(() => void run(), SUGGESTION_DELAY)
        : undefined
    if (timer === undefined) {
      void run()
    }
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [text, revision, attempt])

  return {
    suggestions: settled ? completion.items : [],
    loading,
    error: settled ? completion.error : null,
    retry: () => setAttempt((current) => current + 1),
  }
}
