import { useState } from 'react'
import type { ReactNode } from 'react'
import { SamplesViewStateContext } from './useSamplesViewState'

export function SamplesViewStateProvider({
  children,
}: {
  children: ReactNode
}): React.JSX.Element {
  const [favoritesOnly, setFavoritesOnly] = useState(false)

  return (
    <SamplesViewStateContext value={{ favoritesOnly, setFavoritesOnly }}>
      {children}
    </SamplesViewStateContext>
  )
}
