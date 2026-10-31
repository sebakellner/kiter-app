import { useCallback, useRef, useState } from 'react'
import type { AudioSample, FavoriteState } from '@shared/ipc'
import { unwrapIpcResult } from '@shared/ipc/result'

// One folder's outcome, so a folder that fails never hides the folders after it.
export interface FolderImportOutcome {
  directory: string
  sampleCount: number | null
  error: string | null
}

export function useLibrary(): {
  dir: string | null
  files: AudioSample[]
  loading: boolean
  error: string | null
  revision: number
  importFolders: (directories: string[]) => Promise<FolderImportOutcome[]>
  updateFavorite: (state: FavoriteState) => void
  refreshCatalog: () => void
} {
  const [dir, setDir] = useState<string | null>(null)
  const [files, setFiles] = useState<AudioSample[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const opening = useRef(false)
  const refreshCatalog = useCallback(
    () => setRevision((value) => value + 1),
    [],
  )

  // Standalone import catalogs one folder per request and keeps the last
  // imported folder as the current one, which is the single-folder outcome.
  const importFolders = useCallback(
    async (directories: string[]): Promise<FolderImportOutcome[]> => {
      if (opening.current || directories.length === 0) {
        return []
      }
      opening.current = true
      setLoading(true)
      setError(null)
      const outcomes: FolderImportOutcome[] = []
      try {
        for (const directory of directories) {
          try {
            const nextFiles = unwrapIpcResult(
              await window.api.library.importFolder(directory),
            )
            setDir(directory)
            setFiles(nextFiles)
            setRevision((value) => value + 1)
            outcomes.push({
              directory,
              sampleCount: nextFiles.length,
              error: null,
            })
          } catch (reason) {
            outcomes.push({
              directory,
              sampleCount: null,
              error:
                reason instanceof Error
                  ? reason.message
                  : 'Unable to read the folder',
            })
          }
        }
        const failures = outcomes.filter((outcome) => outcome.error !== null)
        if (failures.length > 0) {
          setError(
            failures.length === outcomes.length
              ? failures[0].error
              : `${failures.length} of ${outcomes.length} folders could not be imported. ${failures[0].error}`,
          )
        }
        return outcomes
      } finally {
        opening.current = false
        setLoading(false)
      }
    },
    [],
  )

  const updateFavorite = useCallback((state: FavoriteState) => {
    setRevision((value) => value + 1)
    setFiles((current) =>
      current.map((file) =>
        file.id === state.id ? { ...file, favorite: state.favorite } : file,
      ),
    )
  }, [])

  return {
    dir,
    files,
    loading,
    error,
    revision,
    importFolders,
    updateFavorite,
    refreshCatalog,
  }
}
