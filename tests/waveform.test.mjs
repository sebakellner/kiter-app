import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import {
  calculatePeaks,
  loadWaveform
} from '../src/renderer/src/features/library/components/Waveform/waveformData.ts'

test('peaks include both polarities, all channels and the final sample', () => {
  assert.deepEqual(calculatePeaks([new Float32Array([0, -1, 0.5, -0.25])], 2), [1, 0.5])
  assert.deepEqual(
    calculatePeaks([new Float32Array([0.5, 0, 0]), new Float32Array([-0.5, 0, -1])], 3),
    [0.5, 0, 1]
  )
  assert.deepEqual(calculatePeaks([new Float32Array([0.5])], 3), [0.5, 0.5, 0.5])
  assert.deepEqual(calculatePeaks([new Float32Array([2, -3])], 2), [1, 1])
})

test('silence and empty audio yield a fixed-size zero waveform', () => {
  assert.deepEqual(calculatePeaks([new Float32Array(10)], 4), [0, 0, 0, 0])
  assert.deepEqual(calculatePeaks([], 3), [0, 0, 0])
  assert.equal(calculatePeaks([new Float32Array(200)]).length, 160)
})

test('invalid bin counts and mismatched channels fail explicitly', () => {
  assert.throws(() => calculatePeaks([], 0), RangeError)
  assert.throws(() => calculatePeaks([], 1.5), RangeError)
  assert.throws(() => calculatePeaks([new Float32Array(1), new Float32Array(2)]), RangeError)
})

test('waveforms are serialized, cached, cancellable and recover after failures', async (t) => {
  let active = 0
  let maximum = 0
  let closed = 0
  let decoding = false
  let decodeDelay = 20
  const original = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext')
  class TestAudioContext {
    constructor() {
      active++
      maximum = Math.max(maximum, active)
    }
    async decodeAudioData() {
      decoding = true
      await delay(decodeDelay)
      decoding = false
      return {
        duration: 2,
        numberOfChannels: 2,
        getChannelData: () => new Float32Array([0, -1, 0.5])
      }
    }
    async close() {
      active--
      closed++
    }
  }
  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    value: TestAudioContext
  })
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url) => {
    if (url === 'sample://failed') return new Response('Unavailable', { status: 404 })
    return new Response(new Uint8Array([1, 2, 3]))
  })

  try {
    const canceled = new AbortController()
    const first = loadWaveform('sample://first', new AbortController().signal)
    const skipped = loadWaveform('sample://skipped', canceled.signal)
    canceled.abort()
    const second = loadWaveform('sample://second', new AbortController().signal)
    const [data] = await Promise.all([
      first,
      assert.rejects(skipped, { name: 'AbortError' }),
      second
    ])
    assert.equal(maximum, 1)
    assert.equal(closed, 2)
    assert.equal(fetchMock.mock.callCount(), 2)
    assert.equal(data.duration, 2)
    assert.equal(data.peaks.length, 160)
    assert.equal(await loadWaveform('sample://first', new AbortController().signal), data)
    assert.equal(fetchMock.mock.callCount(), 2)

    await assert.rejects(loadWaveform('sample://failed', new AbortController().signal), /HTTP 404/)
    await loadWaveform('sample://after-failure', new AbortController().signal)
    assert.equal(active, 0)

    const interrupted = new AbortController()
    const running = loadWaveform('sample://interrupted', interrupted.signal)
    while (!decoding) await delay(1)
    interrupted.abort()
    await assert.rejects(running, { name: 'AbortError' })
    assert.equal(active, 0)
    const calls = fetchMock.mock.callCount()
    await loadWaveform('sample://interrupted', new AbortController().signal)
    assert.equal(fetchMock.mock.callCount(), calls + 1, 'Canceled decodes must not be cached')

    decodeDelay = 0
    for (let index = 0; index < 256; index++) {
      await loadWaveform(`sample://cache-${index}`, new AbortController().signal)
    }
    const filled = fetchMock.mock.callCount()
    for (let index = 0; index < 256; index++) {
      await loadWaveform(`sample://cache-${index}`, new AbortController().signal)
    }
    assert.equal(fetchMock.mock.callCount(), filled, 'The last 256 waveforms must stay cached')
    await loadWaveform('sample://first', new AbortController().signal)
    assert.equal(fetchMock.mock.callCount(), filled + 1, 'Older entries must be evicted')
    assert.equal(active, 0)
  } finally {
    if (original) Object.defineProperty(globalThis, 'AudioContext', original)
    else delete globalThis.AudioContext
  }
})
