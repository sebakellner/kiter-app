import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { useSampleAudioDrag } from './useSampleAudioDrag'
import { createTestApi } from '../../../../../../tests/support/ui/bridge'
import { makeAudioSample } from '../../../../../../tests/support/fixtures/audio-sample'

const sample = makeAudioSample()

test('one owner shares drag props without creating subscriptions per surface and unsubscribes on unmount', () => {
  const api = createTestApi()
  const unsubscribe = vi.fn()
  api.library.onDragError.mockReturnValue(unsubscribe)
  vi.stubGlobal('api', api)
  const { result, rerender, unmount } = renderHook(() => useSampleAudioDrag())

  result.current.getDragProps(sample)
  result.current.getDragProps({ audioUrl: null })
  rerender()
  expect(api.library.onDragError).toHaveBeenCalledOnce()
  expect(unsubscribe).not.toHaveBeenCalled()

  unmount()
  expect(unsubscribe).toHaveBeenCalledOnce()
})

test('audio surfaces cancel HTML dragging and stop propagation so nested sources request native dragging only once', () => {
  const api = createTestApi()
  api.library.onDragError.mockReturnValue(vi.fn())
  vi.stubGlobal('api', api)
  const onAncestorDrag = vi.fn()
  function Sources(): React.JSX.Element {
    const { getDragProps } = useSampleAudioDrag()
    return (
      <section onDragStart={onAncestorDrag}>
        <div {...getDragProps(sample)}>
          <button {...getDragProps(sample)}>Drag audio</button>
        </div>
        <button {...getDragProps({ audioUrl: null })}>Missing audio</button>
      </section>
    )
  }
  render(<Sources />)

  const source = screen.getByRole('button', { name: 'Drag audio' })
  expect(source).toHaveAttribute('draggable', 'true')
  expect(fireEvent.dragStart(source)).toBe(false)
  expect(api.library.startDrag).toHaveBeenCalledExactlyOnceWith(sample.audioUrl)
  expect(onAncestorDrag).not.toHaveBeenCalled()

  const missing = screen.getByRole('button', { name: 'Missing audio' })
  expect(missing).toHaveAttribute('draggable', 'false')
  expect(fireEvent.dragStart(missing)).toBe(false)
  expect(api.library.startDrag).toHaveBeenCalledOnce()
  expect(onAncestorDrag).not.toHaveBeenCalled()
})

test('exposes native errors with their source identity and clears the error on a new gesture', () => {
  const api = createTestApi()
  api.library.onDragError.mockReturnValue(vi.fn())
  vi.stubGlobal('api', api)
  function Source(): React.JSX.Element {
    const { error, getDragProps } = useSampleAudioDrag()
    return (
      <>
        <button {...getDragProps(sample)}>Drag audio</button>
        {error && (
          <p role="alert">
            {error.audioUrl}: {error.message}
          </p>
        )}
      </>
    )
  }
  render(<Source />)
  act(() => {
    api.library.onDragError.mock.calls[0][0]({
      audioUrl: sample.audioUrl,
      message: 'The source is unavailable.',
    })
  })
  expect(screen.getByRole('alert')).toHaveTextContent(sample.audioUrl)
  expect(screen.getByRole('alert')).toHaveTextContent(
    'The source is unavailable.',
  )

  fireEvent.dragStart(screen.getByRole('button', { name: 'Drag audio' }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(api.library.startDrag).toHaveBeenCalledExactlyOnceWith(sample.audioUrl)
  expect(api.library.onDragError).toHaveBeenCalledOnce()
})
