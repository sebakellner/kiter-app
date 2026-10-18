import { createContext, useContext } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { ListSample } from '../SampleList/useSampleList'

type InspectorState = {
  sample: ListSample | null
  setSample: Dispatch<SetStateAction<ListSample | null>>
  open: boolean
  setOpen: (open: boolean) => void
  opener: HTMLElement | null
  openSample: (sample: ListSample, opener: HTMLElement) => void
}

export const SampleInspectorContext = createContext<InspectorState | null>(null)

export function useSampleInspector(): InspectorState {
  const context = useContext(SampleInspectorContext)
  if (!context) {
    throw new Error('Sample inspector requires SampleInspectorProvider')
  }
  return context
}
