import { useCallback, useLayoutEffect, useMemo } from 'react'
import { useLocation, useOutletContext } from 'react-router-dom'
import {
  defaultContext,
  useNavigationStore,
} from '@renderer/stores/useNavigationStore'
import type { ViewContext } from '@renderer/stores/useNavigationStore'

export function useNavigationContext(): {
  context: ViewContext
  update: (patch: Partial<ViewContext>) => void
} {
  const { key, pathname } = useLocation()
  const initial = useMemo(() => {
    const state = useNavigationStore.getState()
    return state.entries[key] ?? state.destinations[pathname] ?? defaultContext
  }, [key, pathname])
  const context = useNavigationStore((state) => state.entries[key] ?? initial)
  const update = useCallback(
    (patch: Partial<ViewContext>) => {
      const state = useNavigationStore.getState()
      state.save(key, pathname, {
        ...(state.entries[key] ?? initial),
        ...patch,
      })
    },
    [key, pathname, initial],
  )

  useLayoutEffect(() => {
    update({})
  }, [update])

  return { context, update }
}

export type CatalogViewContext = {
  context: ViewContext
  update: (patch: Partial<ViewContext>) => void
  onReady: () => void
}

export function useCatalogViewContext(): CatalogViewContext {
  return useOutletContext<CatalogViewContext>()
}
