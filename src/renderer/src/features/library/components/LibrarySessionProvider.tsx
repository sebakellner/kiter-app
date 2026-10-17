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

  async function openFolder(): Promise<boolean> {
    if (await library.openFolder()) {
      return true
    }
    return false
  }

  return (
    <LibrarySessionContext value={{ ...library, preview, openFolder }}>
      {children}
    </LibrarySessionContext>
  )
}
