import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { deferred } from '../../../../../../../tests/support/fixtures/deferred'
import { Waveform } from './Waveform'
import { loadWaveform } from './waveformData'
import type { WaveformData } from './waveformData'

vi.mock('./waveformData', () => ({ loadWaveform: vi.fn() }))

const visibility: ((entries: { isIntersecting: boolean }[]) => void)[] = []

beforeEach(() => {
  visibility.length = 0
  vi.mocked(loadWaveform).mockReset()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        visibility.push(callback)
      }
      observe = vi.fn()
      disconnect = vi.fn()
    },
  )
})

afterEach(() => vi.restoreAllMocks())

function showWaveform(): void {
  const notify = visibility.at(-1)
  if (!notify) {
    throw new Error('The waveform must observe visibility before loading.')
  }
  act(() => notify([{ isIntersecting: true }]))
}

test('Waveform reports measured seconds from its single lazy load without rendering time inline', async () => {
  const result = deferred<WaveformData>()
  vi.mocked(loadWaveform).mockReturnValue(result.promise)
  const onDurationLoaded = vi.fn()
  render(
    <Waveform
      audioUrl="sample://audio/fixture"
      name="Kick"
      compact
      onDurationLoaded={onDurationLoaded}
    />,
  )
  expect(loadWaveform).not.toHaveBeenCalled()
  expect(onDurationLoaded).not.toHaveBeenCalled()
  expect(screen.getByText('Waveform pending')).toBeVisible()
  showWaveform()
  expect(screen.getByText('Calculating waveform...')).toBeVisible()
  expect(loadWaveform).toHaveBeenCalledExactlyOnceWith(
    'sample://audio/fixture',
    expect.any(AbortSignal),
  )
  await act(async () => result.resolve({ peaks: [0.2, 0.6], duration: 1.25 }))
  expect(onDurationLoaded).toHaveBeenCalledExactlyOnceWith(1.25)
  expect(screen.getByRole('img', { name: 'Waveform of Kick' })).toBeVisible()
  expect(screen.queryByText('1.25 s')).not.toBeInTheDocument()
  expect(screen.queryByTestId('sample-duration')).not.toBeInTheDocument()
  expect(loadWaveform).toHaveBeenCalledOnce()
})

test('Waveform failures remain visible and never report an invented duration', async () => {
  vi.mocked(loadWaveform).mockRejectedValue(new Error('Decoder failed.'))
  const onDurationLoaded = vi.fn()
  render(
    <Waveform
      audioUrl="sample://audio/fixture"
      name="Kick"
      onDurationLoaded={onDurationLoaded}
    />,
  )
  showWaveform()
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Unable to generate the waveform. Unsupported or unavailable audio: Decoder failed.',
  )
  expect(onDurationLoaded).not.toHaveBeenCalled()
})

test('Waveform aborts its pending load and ignores late duration results on unmount', async () => {
  const result = deferred<WaveformData>()
  vi.mocked(loadWaveform).mockReturnValue(result.promise)
  const onDurationLoaded = vi.fn()
  const { unmount } = render(
    <Waveform
      audioUrl="sample://audio/fixture"
      name="Kick"
      onDurationLoaded={onDurationLoaded}
    />,
  )
  showWaveform()
  const signal = vi.mocked(loadWaveform).mock.calls[0][1]
  unmount()
  expect(signal.aborted).toBe(true)
  await act(async () => result.resolve({ peaks: [0.2], duration: 2 }))
  expect(onDurationLoaded).not.toHaveBeenCalled()
})
