import { useEffect, useState } from 'react'
import { Alert } from '@renderer/components/ui/Alert'
import { Button } from '@renderer/components/ui/Button'
import type { LibraryPage } from '@shared/ipc/library'
import { unwrapIpcResult } from '@shared/ipc/result'
import { useDeleteCollection } from './useDeleteCollection'

export function DeleteCollection({
  id,
  onClose,
  onDeleted,
}: {
  id: string
  onClose: () => void
  onDeleted: () => void
}): React.JSX.Element {
  const { review, loading, pending, error, reload, confirm } =
    useDeleteCollection(id, onDeleted)
  const [detailsOpen, setDetailsOpen] = useState(false)
  return (
    <Alert
      open
      title="Delete Collection?"
      description={
        review ? (
          <>
            <p>Delete “{review.entity.name}”?</p>
            <p>
              This removes the Collection and its {review.sampleCount} Sample{' '}
              {review.sampleCount === 1 ? 'reference' : 'references'}. Samples,
              Favorites, other Collections and original audio files are kept.
              This cannot be undone.
            </p>
          </>
        ) : (
          <p>Review the current Collection before confirming deletion.</p>
        )
      }
      pending={pending}
      confirmDisabled={loading}
      confirmLabel={
        pending ? 'Deleting…' : review ? 'Delete Collection' : 'Review again'
      }
      onConfirm={() => {
        if (review) {
          void confirm()
        } else {
          reload()
        }
      }}
      onCancel={onClose}
    >
      {loading && <p role="status">Reviewing Collection…</p>}
      {error && <p role="alert">{error}</p>}
      {review && review.sampleCount > 0 && (
        <details onToggle={(event) => setDetailsOpen(event.currentTarget.open)}>
          <summary>View Sample references</summary>
          {detailsOpen && (
            <RemovalMembers key={review.token} id={id} disabled={pending} />
          )}
        </details>
      )}
    </Alert>
  )
}

function RemovalMembers({
  id,
  disabled,
}: {
  id: string
  disabled: boolean
}): React.JSX.Element {
  const [offset, setOffset] = useState(0)
  const [version, setVersion] = useState(0)
  const [page, setPage] = useState<LibraryPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    async function load(): Promise<void> {
      setLoading(true)
      setError(null)
      try {
        const result = unwrapIpcResult(
          await window.api.library.list({
            collectionId: id,
            offset,
            limit: 50,
          }),
        )
        if (active) {
          setPage(result)
        }
      } catch (reason) {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Unable to load Sample references.',
          )
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [id, offset, version])
  return (
    <section aria-label="Sample references" aria-busy={loading}>
      {loading && <p role="status">Loading Sample references…</p>}
      {error && (
        <>
          <p role="alert">{error}</p>
          <Button
            disabled={disabled || loading}
            onClick={() => setVersion((value) => value + 1)}
          >
            Retry references
          </Button>
        </>
      )}
      {page && (
        <>
          <ul>
            {page.items.map((sample) => (
              <li key={sample.id}>
                {sample.name} — {sample.relativePath} (Sample {sample.id})
              </li>
            ))}
          </ul>
          <Button
            disabled={disabled || loading || offset === 0}
            onClick={() => setOffset((value) => Math.max(0, value - 50))}
          >
            Previous references
          </Button>
          <Button
            disabled={
              disabled ||
              loading ||
              page.offset + page.items.length >= page.total
            }
            onClick={() => setOffset((value) => value + 50)}
          >
            Next references
          </Button>
        </>
      )}
    </section>
  )
}
