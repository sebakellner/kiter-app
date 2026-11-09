import { create } from 'zustand'
import type { Instrument } from '@shared/domain/classification'
import type { Genre } from '@shared/domain/recognition'
import type { SampleTypeFilter } from '@shared/features/library/schemas'

export type ViewContext = {
  favoritesOnly: boolean
  instruments: Instrument[]
  genres: Genre[]
  sampleTypes: SampleTypeFilter
  search: string
  offset: number
  selectedId: string | null
  inspectorOpen: boolean
  scrollTop: number
}

export const defaultContext: ViewContext = {
  favoritesOnly: false,
  instruments: [],
  genres: [],
  sampleTypes: [],
  search: '',
  offset: 0,
  selectedId: null,
  inspectorOpen: false,
  scrollTop: 0,
}

type NavigationStore = {
  entries: Record<string, ViewContext>
  destinations: Record<string, ViewContext>
  consumedLocateEntries: Record<string, true>
  save: (key: string, pathname: string, context: ViewContext) => void
  consumeLocateIntent: (key: string) => boolean
}

const MAX_NAVIGATION_ENTRIES = 100

// History snapshots are bounded; destination defaults survive snapshot eviction.
export const useNavigationStore = create<NavigationStore>((set, get) => ({
  entries: {},
  destinations: {},
  consumedLocateEntries: {},
  save: (key, pathname, context) =>
    set((state) => {
      const entries = { ...state.entries, [key]: context }
      const keys = Object.keys(entries)
      if (keys.length > MAX_NAVIGATION_ENTRIES) {
        delete entries[keys[0]]
      }
      // A consumed intent only matters while its history entry exists, so the
      // markers follow the entries they belong to.
      const consumedLocateEntries: Record<string, true> = {}
      for (const entryKey of Object.keys(state.consumedLocateEntries)) {
        if (entryKey in entries) {
          consumedLocateEntries[entryKey] = true
        }
      }
      return {
        entries,
        destinations: { ...state.destinations, [pathname]: context },
        consumedLocateEntries,
      }
    }),
  // A located Sample belongs to one history entry: returning to that entry
  // restores its saved context instead of replaying the intent.
  consumeLocateIntent: (key) => {
    if (get().consumedLocateEntries[key]) {
      return false
    }
    set((state) => {
      const consumed: Record<string, true> = {
        ...state.consumedLocateEntries,
      }
      consumed[key] = true
      return { consumedLocateEntries: consumed }
    })
    return true
  },
}))
