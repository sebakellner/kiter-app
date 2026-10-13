import { memo, useEffect, useRef, useState } from 'react'
import { loadWaveform, type WaveformData } from './waveformData'

type Props = { audioUrl: string; name: string }

export const Waveform = memo(function Waveform({ audioUrl, name }: Props): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  const [data, setData] = useState<WaveformData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: '100px'
    })
    if (container.current) observer.observe(container.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible || data || error) return
    const controller = new AbortController()
    void loadWaveform(audioUrl, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) setData(result)
      },
      (reason: unknown) => {
        if (!controller.signal.aborted) {
          const detail = reason instanceof Error ? reason.message : 'Unknown error'
          setError(`Unable to generate the waveform. Unsupported or unavailable audio: ${detail}`)
        }
      }
    )
    return () => controller.abort()
  }, [audioUrl, visible, data, error])

  useEffect(() => {
    if (!data) return
    const element = canvas.current
    const context = element?.getContext('2d')
    if (!element || !context) return
    context.clearRect(0, 0, element.width, element.height)
    context.fillStyle = '#7c93ee'
    const width = element.width / data.peaks.length
    for (let index = 0; index < data.peaks.length; index++) {
      const height = Math.max(1, data.peaks[index] * (element.height - 4))
      context.fillRect(index * width, (element.height - height) / 2, Math.max(1, width - 1), height)
    }
  }, [data])

  return (
    <div className="sample-waveform" ref={container}>
      <canvas
        ref={canvas}
        width={640}
        height={64}
        hidden={!data}
        role="img"
        aria-label={`Waveform of ${name}`}
      />
      {data ? (
        <span className="sample-duration">{data.duration.toFixed(2)} s</span>
      ) : error ? (
        <span className="sample-error" role="alert">
          {error}
        </span>
      ) : (
        <span className="waveform-status">
          {visible ? 'Calculating waveform...' : 'Waveform pending'}
        </span>
      )}
    </div>
  )
})
