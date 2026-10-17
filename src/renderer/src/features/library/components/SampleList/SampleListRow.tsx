import type { ComponentProps } from 'react'
import { Button } from '@renderer/components/ui/Button'
import type { FavoriteState } from '@shared/ipc'
import { FavoriteButton } from '../FavoriteButton'
import { Waveform } from '../Waveform'
import type { ListSample } from './useSampleList'

type Props = {
  sample: ListSample
  rowProps: ComponentProps<'li'>
  playing: boolean
  dragError: string | null
  onPreview: () => void
  onFavoriteChanged: (state: FavoriteState) => void
}

export function SampleListRow({
  sample,
  rowProps,
  playing,
  dragError,
  onPreview,
  onFavoriteChanged,
}: Props): React.JSX.Element {
  return (
    <li
      {...rowProps}
      title={`${sample.path}\nDrag this sample into your DAW`}
      data-audio-url={sample.audioUrl}
      data-sample-id={sample.id}
    >
      <div role="gridcell">
        <div className="sample-heading">
          <Button
            className="sample-name"
            data-testid="sample-name"
            disabled={!sample.audioUrl}
            draggable={sample.audioUrl !== null}
            aria-label={`Preview ${sample.relativePath}`}
            onClick={onPreview}
          >
            {sample.relativePath}
          </Button>
          {'rootPath' in sample &&
            sample.name !== sample.relativePath.split(/[\\/]/).pop() && (
              <span>{sample.name}</span>
            )}
          <FavoriteButton file={sample} onChanged={onFavoriteChanged} />
          <Button
            draggable={false}
            disabled={!sample.audioUrl}
            className="preview-button"
            data-testid="preview-toggle"
            aria-label={`${playing ? 'Pause' : 'Play'} ${sample.relativePath}`}
            aria-pressed={playing}
            onDragStart={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            onClick={onPreview}
          >
            {playing ? 'Pause' : 'Preview'}
          </Button>
        </div>
        {'rootPath' in sample && <p>{sample.rootPath ?? sample.path}</p>}
        {sample.audioUrl && (
          <Waveform
            key={sample.audioUrl}
            audioUrl={sample.audioUrl}
            name={sample.relativePath}
          />
        )}
        {'unavailableReason' in sample && sample.unavailableReason && (
          <p role="status">{sample.unavailableReason}</p>
        )}
        {dragError && (
          <p role="alert" className="sample-error sample-drag-error">
            {dragError}
          </p>
        )}
      </div>
    </li>
  )
}
