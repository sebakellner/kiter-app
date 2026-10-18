import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AppShell } from '@renderer/components/layouts/AppShell/AppShell'
import { PreviewPlayer } from '@renderer/features/library/components/PreviewPlayer/PreviewPlayer'
import { useLibrarySession } from '@renderer/features/library/hooks/useLibrarySession'
import { AppHeader } from './AppHeader'
import { AppSidebar } from './AppSidebar'
import {
  SampleInspector,
  SampleInspectorProvider,
  useSampleInspector,
} from '@renderer/features/library/components/SampleInspector'
import { useInspectorPanel } from './useInspectorPanel'
import { useShellNavigation } from './useShellNavigation'

export function AppLayout(): React.JSX.Element {
  return (
    <SampleInspectorProvider>
      <AppLayoutContent />
    </SampleInspectorProvider>
  )
}

function AppLayoutContent(): React.JSX.Element {
  useShellNavigation()
  const { open, setOpen, opener } = useSampleInspector()
  const { compact, panel, close } = useInspectorPanel(open, setOpen, opener)
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
      compactInspector={open && compact}
      onDismissInspector={close}
      inspector={
        open && (
          <aside
            id="sample-inspector"
            className="app-shell-inspector"
            ref={panel}
            tabIndex={-1}
            data-shell-region="inspector"
            aria-labelledby="sample-inspector-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !event.defaultPrevented) {
                event.preventDefault()
                event.stopPropagation()
                close()
              }
            }}
          >
            <SampleInspector onClose={close} />
          </aside>
        )
      }
    >
      <main
        id="main-content"
        ref={content}
        tabIndex={-1}
        data-shell-region="content"
        className="app-shell-content"
        aria-busy={loading}
        inert={open && compact}
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
