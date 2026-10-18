import { create } from 'zustand'

export type ViewContext = {
  favoritesOnly: boolean
  offset: number
  selectedId: string | null
  inspectorOpen: boolean
  scrollTop: number
}

export const defaultContext: ViewContext = {
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
export const useNavigationStore = create<NavigationStore>((set) => ({
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
