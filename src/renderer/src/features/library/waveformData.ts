export type WaveformData = { peaks: number[]; duration: number }

const cache = new Map<string, WaveformData>()
let queue: Promise<void> = Promise.resolve()

export function calculatePeaks(channels: readonly Float32Array[], bins = 160): number[] {
  if (!Number.isInteger(bins) || bins < 1) {
    throw new RangeError('El numero de barras debe ser un entero positivo')
  }
  const length = channels[0]?.length ?? 0
  if (channels.some((channel) => channel.length !== length)) {
    throw new RangeError('Los canales deben tener la misma longitud')
  }
  return Array.from({ length: bins }, (_, index) => {
    const start = Math.floor((index * length) / bins)
    const end = Math.min(length, Math.max(start + 1, Math.floor(((index + 1) * length) / bins)))
    let peak = 0
    for (const channel of channels) {
      for (let sample = start; sample < end; sample++) {
        peak = Math.max(peak, Math.abs(channel[sample]))
      }
    }
    return Math.min(peak, 1)
  })
}

export function loadWaveform(url: string, signal: AbortSignal): Promise<WaveformData> {
  const result = queue.then(async () => {
    signal.throwIfAborted()
    const existing = cache.get(url)
    if (existing) return existing

    const response = await fetch(url, { signal })
    if (!response.ok) throw new Error(`Unable to read the sample (HTTP ${response.status})`)
    const bytes = await response.arrayBuffer()
    signal.throwIfAborted()
    const context = new AudioContext()
    try {
      const buffer = await context.decodeAudioData(bytes)
      signal.throwIfAborted()
      const data = {
        duration: buffer.duration,
        peaks: calculatePeaks(
          Array.from({ length: buffer.numberOfChannels }, (_, index) =>
            buffer.getChannelData(index)
          )
        )
      }
      cache.set(url, data)
      if (cache.size > 256) {
        const oldest = cache.keys().next().value
        if (oldest !== undefined) cache.delete(oldest)
      }
      return data
    } finally {
      await context.close()
    }
  })
  // Keep the queue running after failures; the caller still receives the rejected result.
  queue = result.then(
    () => undefined,
    () => undefined
  )
  return result
}
