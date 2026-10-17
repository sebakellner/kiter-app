import { useEffect, useState } from 'react'
import '../../library.css'
import './FileList.css'
import { Button } from '@renderer/components/ui/Button'
import { Checkbox } from '@renderer/components/ui/Checkbox'
import type { AudioDragError, AudioSample, FavoriteState } from '@shared/ipc'
import { Waveform } from '../Waveform'
import { FavoriteButton } from '../FavoriteButton'
import type { PreviewController } from '../../hooks/usePreview'

type Props = {
  files: AudioSample[]
  onFavoriteChanged: (state: FavoriteState) => void
  preview: PreviewController
  favoritesOnly: boolean
  onFavoritesOnlyChanged: (value: boolean) => void
}

export function FileList({
  files,
  onFavoriteChanged,
  preview,
  favoritesOnly,
  onFavoritesOnlyChanged,
}: Props): React.JSX.Element {
  const { selected, playing, togglePreview } = preview
  const [dragError, setDragError] = useState<AudioDragError | null>(null)
  const visibleFiles = favoritesOnly
    ? files.filter((file) => file.favorite)
    : files

  useEffect(() => window.api.library.onDragError(setDragError), [])

  if (files.length === 0) {
    return <p>No audio files to display.</p>
  }

  return (
    <>
      <p className="sample-drag-hint">
        Drag a sample into your DAW to import the original file.
      </p>
      <label className="favorites-filter">
        <Checkbox
          data-testid="favorites-filter"
          checked={favoritesOnly}
          onChange={(event) => onFavoritesOnlyChanged(event.target.checked)}
        />
        Favorites in this folder
      </label>
      {favoritesOnly && visibleFiles.length === 0 && (
        <p>No favorites in this folder yet.</p>
      )}
      <ul className="audio-files" aria-label="Audio files">
        {visibleFiles.map((file) => (
          <li
            key={file.audioUrl}
            title={`${file.path}\nDrag this sample into your DAW`}
            data-audio-url={file.audioUrl}
            data-sample-id={file.id}
            draggable
            onDragStart={(event) => {
              event.preventDefault()
              setDragError(null)
              window.api.library.startDrag(file.audioUrl)
            }}
          >
            <div className="sample-heading">
              <span className="sample-name" data-testid="sample-name">
                {file.relativePath}
              </span>
              <FavoriteButton file={file} onChanged={onFavoriteChanged} />
              <Button
                draggable={false}
                className="preview-button"
                data-testid="preview-toggle"
                aria-label={`${selected?.audioUrl === file.audioUrl && playing ? 'Stop' : 'Play'} ${file.relativePath}`}
                aria-pressed={selected?.audioUrl === file.audioUrl && playing}
                onClick={() => void togglePreview(file)}
              >
                {selected?.audioUrl === file.audioUrl && playing
                  ? 'Stop'
                  : 'Preview'}
              </Button>
            </div>
            <Waveform audioUrl={file.audioUrl} name={file.relativePath} />
            {dragError?.audioUrl === file.audioUrl && (
              <p role="alert" className="sample-error sample-drag-error">
                {dragError.message}
              </p>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
