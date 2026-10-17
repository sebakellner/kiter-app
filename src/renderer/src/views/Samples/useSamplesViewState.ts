import { createContext, useContext } from 'react'

type SamplesViewState = {
  favoritesOnly: boolean
  setFavoritesOnly: (value: boolean) => void
}

export const SamplesViewStateContext = createContext<SamplesViewState | null>(
  null,
)

export function useSamplesViewState(): SamplesViewState {
  const state = useContext(SamplesViewStateContext)
  if (!state) {
    throw new Error('useSamplesViewState requires SamplesViewStateProvider')
  }
  return state
}
