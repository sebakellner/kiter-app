import { useEffect, useRef, useState } from 'react'
import { Button } from '@renderer/components/ui/Button'
import { unwrapIpcResult } from '@shared/ipc/result'
import type { AliasUpdate } from '@shared/ipc/aliasUpdates'
import type { Page } from '@shared/domain/pagination'

export function AliasUpdates({
  onIncorporated,
}: {
  onIncorporated: () => void
}): React.JSX.Element {
  const [page, setPage] = useState<Page<AliasUpdate> | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])

  async function check(offset = 0): Promise<void> {
    setPending(true)
    setError(null)
    try {
      const next = unwrapIpcResult(
        await window.api.classification.listAliasUpdates({ offset }),
      )
      if (active.current) {
        setPage(next)
      }
    } catch (reason) {
      if (active.current) {
        setError(
          reason instanceof Error ? reason.message : 'Unable to check updates.',
        )
      }
    } finally {
      if (active.current) {
        setPending(false)
      }
    }
  }

  async function incorporate(offer: AliasUpdate): Promise<void> {
    setPending(true)
    setError(null)
    try {
      unwrapIpcResult(
        await window.api.classification.incorporateAlias({
          key: offer.key,
          token: offer.token,
        }),
      )
      if (!active.current) {
        return
      }
      setNotice(
        `Added ${offer.term} → ${offer.targetName}. Prepare suggestions again to use it.`,
      )
      onIncorporated()
      await check(0)
    } catch (reason) {
      if (active.current) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'Unable to incorporate alias. Check updates again.',
        )
      }
    } finally {
      if (active.current) {
        setPending(false)
      }
    }
  }

  return (
    <section aria-label="Vocabulary updates">
      <p>
        Recognition uses aliases saved in this library. New app vocabulary is
        available for explicit incorporation.
      </p>
      <Button disabled={pending} onClick={() => void check()}>
        Check vocabulary updates
      </Button>
      {pending && <p role="status">Updating vocabulary...</p>}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {page && (
        <>
          {page.total === 0 ? (
            <p>No new aliases available.</p>
          ) : (
            <p>
              {page.total} new aliases available. Adding an alias does not
              assign classifications.
            </p>
          )}
          <ul>
            {page.items.map((offer) => (
              <li key={offer.key}>
                <p>
                  {offer.term} → {offer.targetName} ({offer.dimension})
                </p>
                {offer.blockedReason && <p>{offer.blockedReason}</p>}
                <Button
                  disabled={pending || offer.blockedReason !== null}
                  onClick={() => void incorporate(offer)}
                >
                  Add alias: {offer.term} → {offer.targetName}
                </Button>
              </li>
            ))}
          </ul>
          <Button
            disabled={pending || page.offset === 0}
            onClick={() => void check(Math.max(0, page.offset - page.limit))}
          >
            Previous aliases
          </Button>
          <Button
            disabled={pending || page.offset + page.items.length >= page.total}
            onClick={() => void check(page.offset + page.limit)}
          >
            Next aliases
          </Button>
        </>
      )}
    </section>
  )
}
