import { useEffect, useRef, useState } from 'react'
import '../../library.css'
import './FavoriteButton.css'
import { Button } from '@renderer/components/ui/Button'
import type { LibrarySample, FavoriteState } from '@shared/ipc'
import { unwrapIpcResult } from '@shared/ipc/result'
import { useToast } from '@renderer/components/ui/Toast'

type Props = {
  file: LibrarySample
  onChanged: (state: FavoriteState) => void
  descriptionId?: string
  compact?: boolean
}

export function FavoriteButton({
  file,
  onChanged,
  descriptionId,
  compact = false,
}: Props): React.JSX.Element {
  const { showToast } = useToast()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const state = useRef({ mounted: false, busy: false })

  useEffect(() => {
    const current = state.current
    current.mounted = true
    return () => {
      current.mounted = false
    }
  }, [])

  async function toggle(): Promise<void> {
    if (state.current.busy) {
      return
    }
    state.current.busy = true
    setPending(true)
    setError(null)
    try {
      const saved = unwrapIpcResult(
        await window.api.library.setFavorite(file.id, !file.favorite),
      )
      if (saved.id !== file.id) {
        throw new Error(
          'The Favorite change could not be verified. Refresh before trying again.',
        )
      }
      onChanged(saved)
      showToast({
        operationId: `favorite:${file.id}`,
        message: saved.favorite
          ? `“${file.name}” added to Favorites.`
          : `“${file.name}” removed from Favorites.`,
      })
    } catch (reason) {
      if (state.current.mounted) {
        setError(
          reason instanceof Error ? reason.message : 'Unable to save favorite',
        )
      }
    } finally {
      state.current.busy = false
      if (state.current.mounted) {
        setPending(false)
      }
    }
  }

  return (
    <div className="sample-favorite">
      <Button
        variant="ghost"
        className="favorite-button"
        data-testid="favorite-toggle"
        draggable={false}
        disabled={pending}
        aria-pressed={file.favorite}
        aria-label={`${file.favorite ? 'Remove favorite' : 'Add favorite'}: ${file.name}`}
        aria-describedby={descriptionId}
        onDragStart={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onClick={() => void toggle()}
      >
        {compact ? (
          <span aria-hidden="true">
            {pending ? '…' : file.favorite ? '♥' : '♡'}
          </span>
        ) : pending ? (
          'Saving...'
        ) : file.favorite ? (
          'Favorited'
        ) : (
          'Favorite'
        )}
      </Button>
      {error && (
        <span role="alert" className="sample-error">
          {error}
        </span>
      )}
    </div>
  )
}
