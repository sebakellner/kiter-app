import { useEffect, useRef, useState } from 'react'
import { unwrapIpcResult } from '@shared/ipc/result'
import type { SearchSuggestionGroup } from '@shared/ipc/search'
import { effectiveCatalogSearch } from '@shared/features/library/search'

/** Search guide: wait 250 ms after typing stops. */
const SUGGESTION_DELAY = 250

type Completion = {
  text: string
  revision: number
  attempt: number
  groups: SearchSuggestionGroup[]
  error: string | null
}

/**
 * Grouped suggestions for the header search: one bounded request returns every
 * entity kind, so the renderer never queries per kind.
 */
export function useSearchSuggestions(
  query: string,
  revision: number,
): {
  groups: SearchSuggestionGroup[]
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
        const response = unwrapIpcResult(
          await window.api.search.suggest({ query: text }),
        )
        if (active) {
          setCompletion({
            text,
            revision,
            attempt,
            groups: response.groups,
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
            groups: [],
            error: message === '' ? 'Unable to search the library.' : message,
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
    groups: settled ? completion.groups : [],
    loading,
    error: settled ? completion.error : null,
    retry: () => setAttempt((current) => current + 1),
  }
}
