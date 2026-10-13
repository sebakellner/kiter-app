import { useEffect, useRef, useState } from 'react'
import type { AudioDragError, AudioSample, FavoriteState } from '@shared/ipc'
import { Waveform } from './Waveform'
import { FavoriteButton } from './FavoriteButton'

type Props = {
  files: AudioSample[]
  onFavoriteChanged: (state: FavoriteState) => void
}

export function FileList({ files, onFavoriteChanged }: Props): React.JSX.Element {
  const player = useRef<HTMLAudioElement>(null)
  const playback = useRef<{ version: number; pendingUrl: string | null }>({
    version: 0,
    pendingUrl: null
  })
  const [selected, setSelected] = useState<AudioSample | null>(null)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragError, setDragError] = useState<AudioDragError | null>(null)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const visibleFiles = favoritesOnly ? files.filter((file) => file.favorite) : files

  useEffect(() => window.api.library.onDragError(setDragError), [])

  useEffect(() => {
    const audio = player.current
    const state = playback.current
    return () => {
      state.version++
      state.pendingUrl = null
      if (audio) {
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
      }
    }
  }, [])

  async function togglePreview(file: AudioSample): Promise<void> {
    const audio = player.current
    if (!audio) {
      setSelected(file)
      setError('Unable to initialize the preview player')
      return
    }
    const state = playback.current
    const version = ++state.version
    if (
      audio.getAttribute('src') === file.audioUrl &&
      (!audio.paused || state.pendingUrl === file.audioUrl)
    ) {
      state.pendingUrl = null
      audio.pause()
      audio.currentTime = 0
      setPlaying(false)
      return
    }

    audio.pause()
    setSelected(file)
    setError(null)
    setPlaying(false)
    state.pendingUrl = file.audioUrl
    audio.src = file.audioUrl
    try {
      await audio.play()
    } catch (reason) {
      if (state.version === version) {
        const detail = reason instanceof Error ? reason.message : 'Unknown error'
        setError(`Unable to play the sample: ${detail}`)
      }
    } finally {
      if (state.version === version) state.pendingUrl = null
    }
  }

  if (files.length === 0) {
    return <p>No audio files to display.</p>
  }

  return (
    <>
      <p className="sample-drag-hint">Drag a sample into your DAW to import the original file.</p>
      <label className="favorites-filter">
        <input
          type="checkbox"
          data-testid="favorites-filter"
          checked={favoritesOnly}
          onChange={(event) => setFavoritesOnly(event.target.checked)}
        />
        Favorites in this folder
      </label>
      {favoritesOnly && visibleFiles.length === 0 && <p>No favorites in this folder yet.</p>}
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
              <span className="sample-name">{file.relativePath}</span>
              <FavoriteButton file={file} onChanged={onFavoriteChanged} />
              <button
                type="button"
                draggable={false}
                className="preview-button"
                aria-label={`${selected?.audioUrl === file.audioUrl && playing ? 'Stop' : 'Play'} ${file.relativePath}`}
                aria-pressed={selected?.audioUrl === file.audioUrl && playing}
                onClick={() => void togglePreview(file)}
              >
                {selected?.audioUrl === file.audioUrl && playing ? 'Stop' : 'Preview'}
              </button>
            </div>
            <Waveform audioUrl={file.audioUrl} name={file.relativePath} />
            {selected?.audioUrl === file.audioUrl && error && (
              <p role="alert" className="sample-error">
                {error}
              </p>
            )}
            {dragError?.audioUrl === file.audioUrl && (
              <p role="alert" className="sample-error sample-drag-error">
                {dragError.message}
              </p>
            )}
          </li>
        ))}
      </ul>
      <div className="preview-player" hidden={!selected}>
        <p>Preview: {selected?.relativePath}</p>
        <audio
          ref={player}
          controls
          preload="none"
          aria-label="Preview player"
          onPlaying={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => {
            setPlaying(false)
            setError('Unable to play the sample. Audio is unsupported or the file is unavailable.')
          }}
        />
      </div>
    </>
  )
}
