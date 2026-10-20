import '../../library.css'
import './SampleList.css'
import type { FavoriteState } from '@shared/ipc'
import type { PreviewController } from '../../hooks/usePreview'
import { SampleListRow } from './SampleListRow'
import { useSampleList } from './useSampleList'
import type { ListSample } from './useSampleList'
import type { CollectionDragController } from '@renderer/features/collections/hooks/useCollectionDrag'
import type { CollectionMoveRequest } from '@shared/domain/collection'
import { useSampleAudioDrag } from '../../hooks/useSampleAudioDrag'

type Props = {
  samples: ListSample[]
  onFavoriteChanged: (state: FavoriteState) => void
  preview: PreviewController
  onSelectionChanged?: (sample: ListSample | null) => void
  onInspect?: (sample: ListSample, opener: HTMLElement) => void
  inspectorOpen?: boolean
  selection?: { id: string | null; onChange: (id: string | null) => void }
  onRemoveFromCollection?: (sample: ListSample) => void
  membershipPending?: boolean
  onAddToCollection?: (sample: ListSample) => void
  order?: {
    drag: CollectionDragController
    offset: number
    total: number
    onMove: (
      sample: ListSample,
      direction: CollectionMoveRequest['direction'],
    ) => void
  }
}

export function SampleList({
  samples,
  onFavoriteChanged,
  preview,
  onSelectionChanged,
  onInspect,
  inspectorOpen = false,
  selection,
  onRemoveFromCollection,
  membershipPending = false,
  onAddToCollection,
  order,
}: Props): React.JSX.Element {
  const audioDrag = useSampleAudioDrag()
  const { previewSample, getRowProps, selectSample } = useSampleList(
    samples,
    preview,
    onSelectionChanged,
    selection,
  )

  if (samples.length === 0) {
    return <p>No audio files to display.</p>
  }

  const nameCounts = new Map<string, number>()
  const locationCounts = new Map<string, number>()
  for (const sample of samples) {
    nameCounts.set(sample.name, (nameCounts.get(sample.name) ?? 0) + 1)
    const key = JSON.stringify([sample.name, sample.relativePath])
    locationCounts.set(key, (locationCounts.get(key) ?? 0) + 1)
  }

  return (
    <>
      <ul className="sample-list" role="grid" aria-label="Audio files">
        {samples.map((sample, index) => (
          <SampleListRow
            key={sample.id}
            sample={sample}
            showRelativePath={
              sample.relativePath !== sample.name ||
              (nameCounts.get(sample.name) ?? 0) > 1
            }
            showSourceFolder={
              (locationCounts.get(
                JSON.stringify([sample.name, sample.relativePath]),
              ) ?? 0) > 1
            }
            rowProps={getRowProps(index)}
            audioDragProps={audioDrag.getDragProps(sample)}
            playing={preview.selected?.id === sample.id && preview.playing}
            dragError={
              audioDrag.error?.audioUrl === sample.audioUrl
                ? audioDrag.error.message
                : null
            }
            onPreview={() => previewSample(sample)}
            onFavoriteChanged={onFavoriteChanged}
            onAddToCollection={
              onAddToCollection ? () => onAddToCollection(sample) : undefined
            }
            onRemoveFromCollection={
              onRemoveFromCollection
                ? () => onRemoveFromCollection(sample)
                : undefined
            }
            membershipPending={membershipPending}
            order={
              order
                ? {
                    drag: order.drag,
                    canMoveUp: order.drag.enabled && order.offset + index > 0,
                    canMoveDown:
                      order.drag.enabled &&
                      order.offset + index < order.total - 1,
                    select: () => selectSample(sample),
                    move: (direction) => order.onMove(sample, direction),
                  }
                : undefined
            }
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
