import { useCallback, useEffectEvent, useLayoutEffect, useRef } from 'react'
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
import { useNavigationContext } from '@renderer/routes/navigationContext'
import type { CatalogViewContext } from '@renderer/routes/navigationContext'

export function AppLayout(): React.JSX.Element {
  const { context, update } = useNavigationContext()
  const { pathname } = useLocation()
  const catalog = pathname === '/samples' || pathname === '/favorites'
  const setOpen = useCallback(
    (inspectorOpen: boolean) => update({ inspectorOpen }),
    [update],
  )
  return (
    <SampleInspectorProvider
      open={catalog && context.inspectorOpen}
      setOpen={setOpen}
    >
      <AppLayoutContent context={context} update={update} />
    </SampleInspectorProvider>
  )
}

function AppLayoutContent({
  context,
  update,
}: Omit<CatalogViewContext, 'onReady'>): React.JSX.Element {
  useShellNavigation()
  const { open, setOpen, opener } = useSampleInspector()
  const { compact, panel, close } = useInspectorPanel(open, setOpen, opener)
  const { loading, error, preview } = useLibrarySession()
  const { pathname, key } = useLocation()
  const content = useRef<HTMLElement>(null)
  const restored = useRef(false)
  const frame = useRef<number | null>(null)
  const scrollTop = useRef(context.scrollTop)
  const catalog = pathname === '/samples' || pathname === '/favorites'

  const onReady = useCallback(() => {
    if (restored.current || frame.current !== null) {
      return
    }
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      const main = content.current
      if (!main) {
        return
      }
      const target =
        compact && open
          ? panel.current
          : (main.querySelector<HTMLElement>(
              '[role="row"][aria-selected="true"]',
            ) ??
            main.querySelector<HTMLElement>('h1') ??
            main)
      if (target?.tagName === 'H1') {
        target.tabIndex = -1
      }
      target?.focus({ preventScroll: true })
      main.scrollTop = scrollTop.current
      restored.current = true
    })
  }, [compact, open, panel])

  const resetRestoration = useEffectEvent(() => {
    restored.current = false
    scrollTop.current = context.scrollTop
    if (!catalog) {
      onReady()
    }
  })

  useLayoutEffect(() => {
    resetRestoration()
    return () => {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current)
        frame.current = null
      }
    }
  }, [key])

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
        onScroll={(event) => {
          if (restored.current) {
            update({ scrollTop: event.currentTarget.scrollTop })
          }
        }}
      >
        {pathname !== '/samples' && error && (
          <p role="alert" className="sample-error">
            {error}
          </p>
        )}
        <Outlet
          context={{ context, update, onReady } satisfies CatalogViewContext}
        />
      </main>
    </AppShell>
  )
}
