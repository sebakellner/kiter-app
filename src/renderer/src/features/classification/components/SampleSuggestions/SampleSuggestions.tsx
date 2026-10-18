import { useEffect, useState } from 'react'
import { Button } from '@renderer/components/ui/Button'
import { Badge } from '@renderer/components/ui/Badge'
import { unwrapIpcResult } from '@shared/ipc/result'
import type { ClassificationPreparationPage } from '@shared/ipc/classification'
import { AliasUpdates } from './AliasUpdates'

export function SampleSuggestions({
  sampleId,
}: {
  sampleId: string
}): React.JSX.Element {
  const [request, setRequest] = useState<{
    offset: number
    token?: string
    version: number
  } | null>(null)
  const [page, setPage] = useState<ClassificationPreparationPage | null>(null)
  const [completion, setCompletion] = useState<{
    request: typeof request
    error: string | null
  } | null>(null)
  const loading = request !== null && completion?.request !== request
  const error = loading ? null : (completion?.error ?? null)
  useEffect(() => {
    if (!request) {
      return
    }
    let active = true
    void window.api.classification
      .prepareSample({ sampleId, offset: request.offset, token: request.token })
      .then(unwrapIpcResult)
      .then((next) => {
        if (active) {
          setPage(next)
          setCompletion({ request, error: null })
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setCompletion({
            request,
            error:
              reason instanceof Error
                ? reason.message
                : 'Unable to prepare suggestions.',
          })
        }
      })
    return () => {
      active = false
    }
  }, [sampleId, request])

  function prepare(): void {
    setPage(null)
    setRequest((current) => ({
      offset: 0,
      version: (current?.version ?? 0) + 1,
    }))
  }

  return (
    <section aria-label="Classification suggestions">
      <h3>Classification suggestions</h3>
      <p>Preview only. Suggestions do not change your library.</p>
      <AliasUpdates
        onIncorporated={() => {
          setPage(null)
          setRequest(null)
          setCompletion(null)
        }}
      />
      <Button onClick={prepare} disabled={loading}>
        {page ? 'Prepare again' : 'Suggest classifications'}
      </Button>
      {loading && <p role="status">Preparing suggestions...</p>}
      {error && (
        <p role="alert">
          {error} <Button onClick={prepare}>Retry preparation</Button>
        </p>
      )}
      {page && (
        <>
          <p>
            {page.proposalCount} proposals; {page.ambiguityCount} ambiguities.
          </p>
          {page.total === 0 && (
            <p>
              No classification clues found in eligible cataloged locations or
              origin Pack Genres.
            </p>
          )}
          <ul aria-label="Classification evidence">
            {(['category', 'genre', 'sample-type'] as const).map(
              (dimension) => {
                const items = page.items.filter(
                  (item) => item.dimension === dimension,
                )
                if (items.length === 0) {
                  return null
                }
                const title = {
                  category: 'Categories',
                  genre: 'Genres',
                  'sample-type': 'Sample type',
                }[dimension]
                return (
                  <li key={dimension}>
                    <h4>{title}</h4>
                    <ul aria-label={`${title} evidence`}>
                      {items.map((item, index) => (
                        <li key={`${page.offset}:${index}`}>
                          <Badge>{item.name}</Badge>
                          {item.kind === 'ambiguity' ? (
                            <p>
                              Ambiguous: {item.reason}. No assignment proposed
                              for this match.
                            </p>
                          ) : (
                            <p>
                              {item.alreadyAssigned
                                ? 'Already assigned'
                                : item.needsCreation
                                  ? 'Would create on acceptance'
                                  : 'Suggested assignment'}
                            </p>
                          )}
                          <p>{item.evidence}</p>
                          <p>
                            Matched clue: {item.clue} ({item.rule})
                          </p>
                        </li>
                      ))}
                    </ul>
                  </li>
                )
              },
            )}
          </ul>
          <nav aria-label="Classification evidence pages">
            <Button
              disabled={loading || page.offset === 0 || error !== null}
              onClick={() =>
                setRequest({
                  offset: Math.max(0, page.offset - page.limit),
                  token: page.token,
                  version: 0,
                })
              }
            >
              Previous evidence
            </Button>
            <span>
              {page.total === 0 ? 0 : page.offset + 1}–
              {Math.min(page.offset + page.items.length, page.total)} of{' '}
              {page.total}
            </span>
            <Button
              disabled={
                loading ||
                page.offset + page.limit >= page.total ||
                error !== null
              }
              onClick={() =>
                setRequest({
                  offset: page.offset + page.limit,
                  token: page.token,
                  version: 0,
                })
              }
            >
              Next evidence
            </Button>
          </nav>
        </>
      )}
    </section>
  )
}
