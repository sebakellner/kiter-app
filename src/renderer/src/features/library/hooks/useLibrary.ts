import { useCallback, useRef, useState } from 'react'
import type { AudioSample, FavoriteState } from '@shared/ipc'

export function useLibrary(): {
  dir: string | null
  files: AudioSample[]
  loading: boolean
  error: string | null
  openFolder: () => Promise<void>
  updateFavorite: (state: FavoriteState) => void
} {
  const [dir, setDir] = useState<string | null>(null)
  const [files, setFiles] = useState<AudioSample[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const opening = useRef(false)

  const openFolder = useCallback(async () => {
    if (opening.current) return
    opening.current = true
    setLoading(true)
    setError(null)
    try {
      const selected = await window.api.dialog.openFolder()
      if (!selected) return

      const nextFiles = await window.api.library.readDir(selected)
      setDir(selected)
      setFiles(nextFiles)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to read the folder')
    } finally {
      opening.current = false
      setLoading(false)
    }
  }, [])

  const updateFavorite = useCallback((state: FavoriteState) => {
    setFiles((current) =>
      current.map((file) => (file.id === state.id ? { ...file, favorite: state.favorite } : file))
    )
  }, [])

  return { dir, files, loading, error, openFolder, updateFavorite }
}
