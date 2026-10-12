import { useEffect, useRef, useState } from 'react'
import type { AudioDragError, AudioSample } from '@shared/ipc'
import { Waveform } from './Waveform'

type Props = {
  files: AudioSample[]
}

export function FileList({ files }: Props): React.JSX.Element {
  const player = useRef<HTMLAudioElement>(null)
  const playback = useRef<{ version: number; pendingUrl: string | null }>({
    version: 0,
    pendingUrl: null
  })
  const [selected, setSelected] = useState<AudioSample | null>(null)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragError, setDragError] = useState<AudioDragError | null>(null)

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
      setError('No se pudo inicializar el reproductor')
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
        const detail = reason instanceof Error ? reason.message : 'Error desconocido'
        setError(`No se pudo reproducir el sample: ${detail}`)
      }
    } finally {
      if (state.version === version) state.pendingUrl = null
    }
  }

  if (files.length === 0) {
    return <p>No hay archivos de audio para mostrar.</p>
  }

  return (
    <>
      <p className="sample-drag-hint">
        Arrastra un sample a tu DAW para importar el archivo original.
      </p>
      <ul className="audio-files" aria-label="Archivos de audio">
        {files.map((file) => (
          <li
            key={file.audioUrl}
            title={`${file.path}\nArrastra este sample a tu DAW`}
            data-audio-url={file.audioUrl}
            draggable
            onDragStart={(event) => {
              event.preventDefault()
              setDragError(null)
              window.api.library.startDrag(file.audioUrl)
            }}
          >
            <div className="sample-heading">
              <span className="sample-name">{file.relativePath}</span>
              <button
                type="button"
                draggable={false}
                className="preview-button"
                aria-label={`${selected?.audioUrl === file.audioUrl && playing ? 'Detener' : 'Reproducir'} ${file.relativePath}`}
                aria-pressed={selected?.audioUrl === file.audioUrl && playing}
                onClick={() => void togglePreview(file)}
              >
                {selected?.audioUrl === file.audioUrl && playing ? 'Detener' : 'Preview'}
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
          aria-label="Reproductor de preview"
          onPlaying={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => {
            setPlaying(false)
            setError(
              'No se pudo reproducir el sample. Audio no compatible o archivo no disponible.'
            )
          }}
        />
      </div>
    </>
  )
}
