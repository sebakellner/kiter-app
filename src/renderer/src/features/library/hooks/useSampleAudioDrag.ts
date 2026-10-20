import { useEffect, useState } from 'react'
import type { DragEventHandler } from 'react'
import type { AudioDragError, CatalogAudioSample } from '@shared/ipc/library'

export type SampleAudioDragProps = {
  draggable: boolean
  onDragStart: DragEventHandler<HTMLElement>
}

// Mount once per list, then share the returned props across its audio surfaces.
export function useSampleAudioDrag(): {
  error: AudioDragError | null
  getDragProps: (
    sample: Pick<CatalogAudioSample, 'audioUrl'>,
  ) => SampleAudioDragProps
} {
  const [error, setError] = useState<AudioDragError | null>(null)

  useEffect(() => window.api.library.onDragError(setError), [])

  return {
    error,
    getDragProps: (sample) => ({
      draggable: sample.audioUrl !== null,
      onDragStart: (event) => {
        event.preventDefault()
        event.stopPropagation()
        setError(null)
        if (sample.audioUrl) {
          window.api.library.startDrag(sample.audioUrl)
        }
      },
    }),
  }
}
