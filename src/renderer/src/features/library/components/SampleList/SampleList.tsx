import '../../library.css'
import './SampleList.css'
import type { FavoriteState } from '@shared/ipc'
import type { PreviewController } from '../../hooks/usePreview'
import { SampleListRow } from './SampleListRow'
import { useSampleList } from './useSampleList'
import type { ListSample } from './useSampleList'

type Props = {
  samples: ListSample[]
  onFavoriteChanged: (state: FavoriteState) => void
  preview: PreviewController
  onSelectionChanged?: (sample: ListSample | null) => void
  onInspect?: (sample: ListSample, opener: HTMLElement) => void
  inspectorOpen?: boolean
}

export function SampleList({
  samples,
  onFavoriteChanged,
  preview,
  onSelectionChanged,
  onInspect,
  inspectorOpen = false,
}: Props): React.JSX.Element {
  const { dragError, previewSample, getRowProps, selectSample } = useSampleList(
    samples,
    preview,
    onSelectionChanged,
  )

  if (samples.length === 0) {
    return <p>No audio files to display.</p>
  }

  return (
    <>
      <p className="sample-drag-hint">
        Drag a sample into your DAW to import the original file.
      </p>
      <ul className="sample-list" role="grid" aria-label="Audio files">
        {samples.map((sample, index) => (
          <SampleListRow
            key={sample.id}
            sample={sample}
            rowProps={getRowProps(index)}
            playing={preview.selected?.id === sample.id && preview.playing}
            dragError={
              dragError?.audioUrl === sample.audioUrl ? dragError.message : null
            }
            onPreview={() => previewSample(sample)}
            onFavoriteChanged={onFavoriteChanged}
            inspectorOpen={inspectorOpen}
            onInspect={
              onInspect
                ? (opener) => {
                    selectSample(sample)
                    onInspect(sample, opener)
                  }
                : undefined
            }
          />
        ))}
      </ul>
    </>
  )
}
