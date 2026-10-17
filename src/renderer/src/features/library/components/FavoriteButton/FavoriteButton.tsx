import { useEffect, useRef, useState } from 'react'
import '../../library.css'
import './FavoriteButton.css'
import { Button } from '@renderer/components/ui/Button'
import type { LibrarySample, FavoriteState } from '@shared/ipc'
import { unwrapIpcResult } from '@shared/ipc/result'

type Props = { file: LibrarySample; onChanged: (state: FavoriteState) => void }

export function FavoriteButton({ file, onChanged }: Props): React.JSX.Element {
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
      onChanged(saved)
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
        className="favorite-button"
        data-testid="favorite-toggle"
        draggable={false}
        disabled={pending}
        aria-pressed={file.favorite}
        aria-label={`${file.favorite ? 'Remove favorite' : 'Add favorite'}: ${file.relativePath}`}
        onDragStart={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onClick={() => void toggle()}
      >
        {pending ? 'Saving...' : file.favorite ? 'Favorited' : 'Favorite'}
      </Button>
      {error && (
        <span role="alert" className="sample-error">
          {error}
        </span>
      )}
    </div>
  )
}
