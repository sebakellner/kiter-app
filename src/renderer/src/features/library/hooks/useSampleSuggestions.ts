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
  // Typing alone decides the delay; retries, revision refreshes and the first
  // render of a restored query run at once. A refresh trigger must not shorten
  // a typing window that is still open.
  const previousText = useRef(text)
  const pendingText = useRef<string | null>(null)
  const settled =
    completion !== null &&
    completion.text === text &&
    completion.revision === revision &&
    completion.attempt === attempt
  const loading = text !== '' && !settled

  useEffect(() => {
    if (text === '') {
      previousText.current = text
      pendingText.current = null
      return
    }
    let active = true
    const run = async (): Promise<void> => {
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
        const message = reason instanceof Error ? reason.message.trim() : ''
        if (active) {
          setCompletion({
            text,
            revision,
            attempt,
            items: [],
            error: message === '' ? 'Unable to search samples.' : message,
          })
        }
      }
    }
    if (previousText.current !== text) {
      previousText.current = text
      pendingText.current = text
    }
    const timer =
      pendingText.current === text
        ? setTimeout(() => {
            pendingText.current = null
            void run()
          }, SUGGESTION_DELAY)
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
