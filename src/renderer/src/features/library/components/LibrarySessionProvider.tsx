import type { ReactNode } from 'react'
import { useLibrary } from '../hooks/useLibrary'
import { usePreview } from '../hooks/usePreview'
import { LibrarySessionContext } from '../hooks/useLibrarySession'

export function LibrarySessionProvider({
  children,
}: {
  children: ReactNode
}): React.JSX.Element {
  const library = useLibrary()
  const preview = usePreview()

  return (
    <LibrarySessionContext value={{ ...library, preview }}>
      {children}
    </LibrarySessionContext>
  )
}
