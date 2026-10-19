import { useEffect, useState } from 'react'
import type { ComponentProps } from 'react'
import type { AudioSample } from '@shared/ipc'
import type { CatalogAudioSample } from '@shared/ipc/library'
import type { PreviewController } from '../../hooks/usePreview'

export type ListSample = AudioSample | CatalogAudioSample

type SampleListController = {
  previewSample: (sample: ListSample) => void
  getRowProps: (index: number) => ComponentProps<'li'>
  selectSample: (sample: ListSample) => void
}

export function useSampleList(
  samples: ListSample[],
  preview: PreviewController,
  onSelectionChanged?: (sample: ListSample | null) => void,
  selection?: { id: string | null; onChange: (id: string | null) => void },
): SampleListController {
  const [localId, setLocalId] = useState<string | null>(null)
  const activeId = selection ? selection.id : localId
  const setActiveId = selection ? selection.onChange : setLocalId

  useEffect(() => {
    if (
      activeId !== null &&
      !samples.some((sample) => sample.id === activeId)
    ) {
      setActiveId(null)
    }
  }, [activeId, samples, setActiveId])

  const activeSample = samples.find((sample) => sample.id === activeId) ?? null
  useEffect(() => {
    onSelectionChanged?.(activeSample)
  }, [activeSample, onSelectionChanged])

  useEffect(() => () => onSelectionChanged?.(null), [onSelectionChanged])

  function previewSample(sample: ListSample): void {
    if (sample.audioUrl) {
      void preview.togglePreview({ ...sample, audioUrl: sample.audioUrl })
    }
  }

  function getRowProps(index: number): ComponentProps<'li'> {
    const sample = samples[index]
    return {
      role: 'row',
      'aria-selected': activeId === sample.id,
      tabIndex:
        activeId === sample.id || (activeId === null && index === 0) ? 0 : -1,
      onClick: (event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('button, input, a, audio')
        ) {
          return
        }
        setActiveId(sample.id)
        event.currentTarget.focus()
      },
      onKeyDown: (event) => {
        if (
          event.target !== event.currentTarget ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey
        ) {
          return
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          const nextIndex = Math.max(
            0,
            Math.min(
              samples.length - 1,
              index + (event.key === 'ArrowDown' ? 1 : -1),
            ),
          )
          setActiveId(samples[nextIndex].id)
          const row = event.currentTarget.parentElement?.children[nextIndex]
          if (row instanceof HTMLElement) {
            row.focus()
          }
        } else if (event.key === 'Enter') {
          event.preventDefault()
          setActiveId(sample.id)
          previewSample(sample)
        } else if (event.key === ' ') {
          event.preventDefault()
          if (!event.repeat && preview.selected) {
            void preview.togglePreview(preview.selected)
          }
        }
      },
    }
  }

  return {
    previewSample,
    getRowProps,
    selectSample: (sample) => setActiveId(sample.id),
  }
}
