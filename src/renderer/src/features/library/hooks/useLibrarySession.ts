import { createContext, useContext } from 'react'
import type { useLibrary } from './useLibrary'
import type { PreviewController } from './usePreview'

export type LibrarySession = ReturnType<typeof useLibrary> & {
  preview: PreviewController
}

export const LibrarySessionContext = createContext<LibrarySession | null>(null)

export function useLibrarySession(): LibrarySession {
  const session = useContext(LibrarySessionContext)
  if (!session) {
    throw new Error('useLibrarySession requires LibrarySessionProvider')
  }
  return session
}
