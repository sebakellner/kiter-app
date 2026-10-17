import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { AudioSample } from '@shared/ipc'

export type PreviewController = {
  player: RefObject<HTMLAudioElement | null>
  selected: AudioSample | null
  playing: boolean
  error: string | null
  setPlaying: (playing: boolean) => void
  setError: (error: string | null) => void
  stop: () => void
  reset: () => void
  togglePreview: (file: AudioSample) => Promise<void>
}

export function usePreview(): PreviewController {
  const player = useRef<HTMLAudioElement>(null)
  const playback = useRef<{ version: number; pendingUrl: string | null }>({
    version: 0,
    pendingUrl: null,
  })
  const [selected, setSelected] = useState<AudioSample | null>(null)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function stop(): void {
    playback.current.version++
    playback.current.pendingUrl = null
    player.current?.pause()
    if (player.current) {
      player.current.currentTime = 0
    }
    setPlaying(false)
  }

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

  function reset(): void {
    stop()
    const audio = player.current
    if (audio) {
      audio.removeAttribute('src')
      audio.load()
    }
    setSelected(null)
    setError(null)
  }

  async function togglePreview(file: AudioSample): Promise<void> {
    const audio = player.current
    if (!audio) {
      setError('Unable to initialize the preview player')
      return
    }
    const state = playback.current
    if (
      audio.getAttribute('src') === file.audioUrl &&
      (!audio.paused || state.pendingUrl === file.audioUrl)
    ) {
      state.version++
      state.pendingUrl = null
      audio.pause()
      setPlaying(false)
      return
    }

    const version = ++state.version
    audio.pause()
    setSelected(file)
    setError(null)
    setPlaying(false)
    state.pendingUrl = file.audioUrl
    if (audio.getAttribute('src') !== file.audioUrl) {
      audio.src = file.audioUrl
    } else if (audio.ended) {
      audio.currentTime = 0
    }
    try {
      await audio.play()
    } catch {
      if (state.version === version) {
        setError(
          'Unable to play the sample. Audio is unsupported or the file is unavailable.',
        )
      }
    } finally {
      if (state.version === version) {
        state.pendingUrl = null
      }
    }
  }

  return {
    player,
    selected,
    playing,
    error,
    setPlaying,
    setError,
    stop,
    reset,
    togglePreview,
  }
}
