import { catalogSearchSchema } from '@shared/features/library/schemas'
import { isEntityId, isRecord } from '@shared/domain/validation'
import type { ViewContext } from '@renderer/stores/useNavigationStore'

/** Router state that asks the Samples view to locate one Sample. */
export type LocateSampleState = {
  locateSampleId: string
  locateSearch: string
}

export function locateSampleState(sample: {
  id: string
  name: string
}): LocateSampleState {
  return { locateSampleId: sample.id, locateSearch: sample.name }
}

/**
 * Samples view context for a located Sample. Filters that would hide the row are
 * cleared; the Sample name becomes the local query so the row is on the first
 * page without an offset jump. A name the catalog search contract rejects falls
 * back to an empty query instead of an invalid request.
 */
export function locateSamplePatch(state: unknown): Partial<ViewContext> | null {
  if (!isRecord(state) || !isEntityId(state.locateSampleId)) {
    return null
  }
  const name = typeof state.locateSearch === 'string' ? state.locateSearch : ''
  return {
    favoritesOnly: false,
    instruments: [],
    genres: [],
    sampleTypes: [],
    search: catalogSearchSchema.safeParse(name).success ? name : '',
    offset: 0,
    scrollTop: 0,
    selectedId: state.locateSampleId,
  }
}
