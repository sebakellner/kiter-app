import { isEntityId, isRecord } from '@shared/domain/validation'
import type { ViewContext } from '@renderer/stores/useNavigationStore'

/** Router state that asks the Samples view to filter by one Genre. */
export type LocateGenreState = {
  locateGenreId: string
  locateGenreName: string
}

export function locateGenreState(genre: {
  id: string
  name: string
}): LocateGenreState {
  return { locateGenreId: genre.id, locateGenreName: genre.name }
}

/**
 * Samples view context for an activated Genre suggestion. Genres have no detail
 * route, so Samples opens filtered by the Genre; local search and other filters
 * that would hide its Samples are cleared.
 */
export function locateGenrePatch(state: unknown): Partial<ViewContext> | null {
  if (
    !isRecord(state) ||
    !isEntityId(state.locateGenreId) ||
    typeof state.locateGenreName !== 'string' ||
    state.locateGenreName.trim() === ''
  ) {
    return null
  }
  return {
    favoritesOnly: false,
    instruments: [],
    genres: [{ id: state.locateGenreId, name: state.locateGenreName }],
    sampleTypes: [],
    search: '',
    offset: 0,
    scrollTop: 0,
    selectedId: null,
  }
}
