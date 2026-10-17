import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AppShell } from '@renderer/components/layouts/AppShell/AppShell'
import { PreviewPlayer } from '@renderer/features/library/components/PreviewPlayer/PreviewPlayer'
import { useLibrarySession } from '@renderer/features/library/hooks/useLibrarySession'
import { AppHeader } from './AppHeader'
import { AppSidebar } from './AppSidebar'

export function AppLayout(): React.JSX.Element {
  const { loading, error, preview } = useLibrarySession()
  const { pathname } = useLocation()
  const content = useRef<HTMLElement>(null)

  useEffect(() => {
    content.current?.focus()
    content.current?.scrollTo?.(0, 0)
  }, [pathname])

  return (
    <AppShell
      header={<AppHeader />}
      sidebar={<AppSidebar />}
      player={<PreviewPlayer preview={preview} />}
    >
      <main
        id="main-content"
        ref={content}
        tabIndex={-1}
        className="app-shell-content"
        aria-busy={loading}
      >
        {pathname !== '/samples' && error && (
          <p role="alert" className="sample-error">
            {error}
          </p>
        )}
        <Outlet />
      </main>
    </AppShell>
  )
}
