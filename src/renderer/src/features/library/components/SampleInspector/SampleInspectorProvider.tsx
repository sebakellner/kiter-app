import { useState } from 'react'
import type { ReactNode } from 'react'
import type { ListSample } from '../SampleList/useSampleList'
import { SampleInspectorContext } from './useSampleInspector'

export function SampleInspectorProvider({
  children,
  open,
  setOpen,
}: {
  children: ReactNode
  open: boolean
  setOpen: (open: boolean) => void
}): React.JSX.Element {
  const [sample, setSample] = useState<ListSample | null>(null)
  const [opener, setOpener] = useState<HTMLElement | null>(null)

  function openSample(sample: ListSample, element: HTMLElement): void {
    setSample(sample)
    setOpener(element)
    setOpen(true)
  }

  return (
    <SampleInspectorContext
      value={{ sample, setSample, open, setOpen, opener, openSample }}
    >
      {children}
    </SampleInspectorContext>
  )
}
