import { create } from 'zustand'
import { useCallback, useLayoutEffect, useMemo } from 'react'
import { useLocation, useOutletContext } from 'react-router-dom'

export type ViewContext = {
  favoritesOnly: boolean
  offset: number
  selectedId: string | null
  inspectorOpen: boolean
  scrollTop: number
}

const defaultContext: ViewContext = {
  favoritesOnly: false,
  offset: 0,
  selectedId: null,
  inspectorOpen: false,
  scrollTop: 0,
}

type NavigationStore = {
  entries: Record<string, ViewContext>
  destinations: Record<string, ViewContext>
  save: (key: string, pathname: string, context: ViewContext) => void
}

// History snapshots are bounded; destination defaults survive snapshot eviction.
const useNavigationStore = create<NavigationStore>((set) => ({
  entries: {},
  destinations: {},
  save: (key, pathname, context) =>
    set((state) => {
      const entries = { ...state.entries, [key]: context }
      const keys = Object.keys(entries)
      if (keys.length > 100) {
        delete entries[keys[0]]
      }
      return {
        entries,
        destinations: { ...state.destinations, [pathname]: context },
      }
    }),
}))

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
