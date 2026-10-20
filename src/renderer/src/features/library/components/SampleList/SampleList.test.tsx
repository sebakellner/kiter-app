import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { useState } from 'react'
import { SampleList } from './SampleList'
import type { PreviewController } from '../../hooks/usePreview'
import { makeAudioSample } from '../../../../../../../tests/support/fixtures/audio-sample'
import { createTestApi } from '../../../../../../../tests/support/ui/bridge'
import {
  useCollectionDrag,
  COLLECTION_REORDER_MIME,
} from '@renderer/features/collections/hooks/useCollectionDrag'

vi.mock('../Waveform', () => ({
  Waveform: ({ name }: { name: string }) => (
    <span role="img" aria-label={`Waveform of ${name}`} />
  ),
}))

function transfer(): {
  types: string[]
  effectAllowed: string
  dropEffect: string
  getData: (type: string) => string
  setData: (type: string, value: string) => void
  setDragImage: ReturnType<typeof vi.fn>
} {
  const values = new Map<string, string>()
  return {
    get types() {
      return [...values.keys()]
    },
    effectAllowed: 'none',
    dropEffect: 'none',
    getData: (type) => values.get(type) ?? '',
    setData: (type, value) => {
      values.set(type, value)
    },
    setDragImage: vi.fn(),
  }
}

function dragEvent(
  target: Element,
  type: 'dragover' | 'drop',
  dataTransfer: ReturnType<typeof transfer>,
  clientY: number,
): void {
  // jsdom has no DragEvent constructor; MouseEvent preserves the hit-test coordinates.
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientY,
  })
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
  fireEvent(target, event)
}

const kick = makeAudioSample()
const snare = makeAudioSample({
  id: '00000000-0000-4000-8000-000000000003',
  name: 'snare.wav',
  relativePath: 'snare.wav',
  audioUrl: 'sample://audio/00000000-0000-4000-8000-000000000004',
})

function setup(): {
  api: ReturnType<typeof createTestApi>
  preview: PreviewController
} {
  const api = createTestApi()
  api.library.onDragError.mockReturnValue(vi.fn())
  vi.stubGlobal('api', api)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
    },
  )
  const preview: PreviewController = {
    player: { current: null },
    selected: kick,
    playing: true,
    error: null,
    setPlaying: vi.fn(),
    setError: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
    togglePreview: vi.fn().mockResolvedValue(undefined),
  }
  return { api, preview }
}

test('row selection is independent of preview, favorite and native dragging', async () => {
  const user = userEvent.setup()
  const { api, preview } = setup()
  api.library.setFavorite.mockResolvedValue({
    ok: true,
    data: { id: kick.id, favorite: true },
  })
  render(
    <SampleList
      samples={[kick, snare]}
      preview={preview}
      onFavoriteChanged={vi.fn()}
    />,
  )
  const [first, second] = screen.getAllByRole('row')
  expect(api.library.onDragError).toHaveBeenCalledOnce()
  expect(first).toHaveAttribute('aria-selected', 'false')
  await user.click(second)
  expect(second).toHaveAttribute('aria-selected', 'true')
  expect(preview.togglePreview).not.toHaveBeenCalled()

  await user.click(
    within(first).getByRole('button', { name: 'Add favorite: kick.wav' }),
  )
  expect(second).toHaveAttribute('aria-selected', 'true')
  expect(preview.togglePreview).not.toHaveBeenCalled()

  fireEvent.dragStart(within(first).getByTestId('sample-name'))
  expect(api.library.startDrag).toHaveBeenCalledWith(kick.audioUrl)
  expect(api.library.startDrag).toHaveBeenCalledTimes(1)
  expect(second).toHaveAttribute('aria-selected', 'true')
  fireEvent.dragStart(
    within(first).getByRole('img', { name: 'Waveform of kick.wav' }),
  )
  expect(api.library.startDrag).toHaveBeenCalledTimes(2)
  expect(second).toHaveAttribute('aria-selected', 'true')
  fireEvent.dragStart(first)
  expect(api.library.startDrag).toHaveBeenCalledTimes(3)
  expect(second).toHaveAttribute('aria-selected', 'true')
  fireEvent.dragStart(within(first).getByTestId('preview-toggle'))
  expect(api.library.startDrag).toHaveBeenCalledTimes(3)

  await user.click(within(first).getByTestId('sample-name'))
  expect(preview.togglePreview).toHaveBeenLastCalledWith(kick)
  expect(second).toHaveAttribute('aria-selected', 'true')
})

test('arrows select without playing, Enter previews and Space controls the loaded sample', async () => {
  const user = userEvent.setup()
  const { preview } = setup()
  render(
    <SampleList
      samples={[kick, snare]}
      preview={preview}
      onFavoriteChanged={vi.fn()}
    />,
  )
  const [first, second] = screen.getAllByRole('row')
  first.focus()
  await user.keyboard('{ArrowDown}')
  expect(second).toHaveFocus()
  expect(second).toHaveAttribute('aria-selected', 'true')
  expect(preview.togglePreview).not.toHaveBeenCalled()
  await user.keyboard(' ')
  expect(preview.togglePreview).toHaveBeenLastCalledWith(kick)
  await user.keyboard('{Enter}')
  expect(preview.togglePreview).toHaveBeenLastCalledWith(snare)
  await user.keyboard('{ArrowDown}')
  expect(second).toHaveFocus()
  await user.keyboard('{ArrowUp}')
  expect(first).toHaveFocus()
  expect(first).toHaveAttribute('aria-selected', 'true')
  expect(second).toHaveAttribute('aria-selected', 'false')
})

test('one list subscription reports native errors only on their source row and is released on unmount', () => {
  const { api, preview } = setup()
  const unsubscribe = vi.fn()
  api.library.onDragError.mockReturnValue(unsubscribe)
  const onFavoriteChanged = vi.fn()
  const { rerender, unmount } = render(
    <SampleList
      samples={[kick, snare]}
      preview={preview}
      onFavoriteChanged={onFavoriteChanged}
    />,
  )
  const [first, second] = screen.getAllByRole('row')
  act(() => {
    api.library.onDragError.mock.calls[0][0]({
      audioUrl: snare.audioUrl,
      message: 'The source is unavailable.',
    })
  })
  expect(within(first).queryByRole('alert')).not.toBeInTheDocument()
  expect(within(second).getByRole('alert')).toHaveTextContent(
    'The source is unavailable.',
  )
  fireEvent.dragStart(within(first).getByTestId('sample-name'))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()

  rerender(
    <SampleList
      samples={[kick]}
      preview={preview}
      onFavoriteChanged={onFavoriteChanged}
    />,
  )
  act(() => {
    api.library.onDragError.mock.calls[0][0]({
      audioUrl: snare.audioUrl,
      message: 'The source is unavailable.',
    })
  })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(api.library.onDragError).toHaveBeenCalledOnce()
  expect(preview.togglePreview).not.toHaveBeenCalled()
  unmount()
  expect(unsubscribe).toHaveBeenCalledOnce()
})

test('clears hidden selection without selecting a replacement and keeps unavailable rows selectable', async () => {
  const user = userEvent.setup()
  const { preview } = setup()
  const unavailable = {
    ...snare,
    audioUrl: null,
    rootPath: '/fixtures',
    sourceRevision: 1,
    unavailableReason: 'Audio unavailable.',
  }
  const { rerender } = render(
    <SampleList
      samples={[kick, unavailable]}
      preview={preview}
      onFavoriteChanged={vi.fn()}
    />,
  )
  await user.click(screen.getAllByRole('row')[1])
  expect(screen.getAllByRole('row')[1]).toHaveAttribute('aria-selected', 'true')
  await user.keyboard('{Enter}')
  expect(preview.togglePreview).not.toHaveBeenCalled()
  rerender(
    <SampleList
      samples={[kick]}
      preview={preview}
      onFavoriteChanged={vi.fn()}
    />,
  )
  expect(screen.getByRole('row')).toHaveAttribute('aria-selected', 'false')
  rerender(
    <SampleList
      samples={[kick, unavailable]}
      preview={preview}
      onFavoriteChanged={vi.fn()}
    />,
  )
  expect(screen.getAllByRole('row')[1]).toHaveAttribute(
    'aria-selected',
    'false',
  )
})

test('controlled selection restores by ID, follows keyboard changes and stays cleared when a hidden row returns', async () => {
  const user = userEvent.setup()
  const { preview } = setup()
  function ControlledList({
    samples,
  }: {
    samples: (typeof kick)[]
  }): React.JSX.Element {
    const [id, onChange] = useState<string | null>(snare.id)
    return (
      <SampleList
        samples={samples}
        preview={preview}
        onFavoriteChanged={vi.fn()}
        selection={{ id, onChange }}
      />
    )
  }
  const { rerender } = render(<ControlledList samples={[kick, snare]} />)
  const [first, second] = screen.getAllByRole('row')
  expect(second).toHaveAttribute('aria-selected', 'true')
  second.focus()
  await user.keyboard('{ArrowUp}')
  expect(first).toHaveFocus()
  expect(first).toHaveAttribute('aria-selected', 'true')
  expect(second).toHaveAttribute('aria-selected', 'false')
  rerender(<ControlledList samples={[snare]} />)
  expect(screen.getByRole('row')).toHaveAttribute('aria-selected', 'false')
  rerender(<ControlledList samples={[kick, snare]} />)
  for (const row of screen.getAllByRole('row')) {
    expect(row).toHaveAttribute('aria-selected', 'false')
  }
  expect(preview.togglePreview).not.toHaveBeenCalled()
})

test('a refreshed order preserves selection by identity without changing the loaded preview', async () => {
  const user = userEvent.setup()
  const { preview } = setup()
  const onFavoriteChanged = vi.fn()
  const { rerender } = render(
    <SampleList
      samples={[kick, snare]}
      preview={preview}
      onFavoriteChanged={onFavoriteChanged}
    />,
  )
  await user.click(screen.getAllByRole('row')[1])
  rerender(
    <SampleList
      samples={[snare, kick]}
      preview={preview}
      onFavoriteChanged={onFavoriteChanged}
    />,
  )
  const [first, second] = screen.getAllByRole('row')
  expect(first).toHaveTextContent('snare.wav')
  expect(first).toHaveAttribute('aria-selected', 'true')
  expect(second).toHaveAttribute('aria-selected', 'false')
  expect(within(second).getByTestId('preview-toggle')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(preview.togglePreview).not.toHaveBeenCalled()
  expect(preview.stop).not.toHaveBeenCalled()
  expect(preview.reset).not.toHaveBeenCalled()
})

test('row right-click and More actions share a menu without selecting, previewing or dragging; Info targets the clicked Sample', async () => {
  const user = userEvent.setup()
  const { api, preview } = setup()
  const onInspect = vi.fn()
  const onAddToCollection = vi.fn()
  render(
    <SampleList
      samples={[kick, snare]}
      preview={preview}
      onFavoriteChanged={vi.fn()}
      onInspect={onInspect}
      onAddToCollection={onAddToCollection}
    />,
  )
  const [first, second] = screen.getAllByRole('row')
  await user.click(second)
  fireEvent.contextMenu(first, { clientX: 120, clientY: 160 })
  expect(
    screen.getByRole('menu', { name: 'Actions for kick.wav' }),
  ).toBeVisible()
  expect(second).toHaveAttribute('aria-selected', 'true')
  expect(preview.togglePreview).not.toHaveBeenCalled()
  expect(api.library.startDrag).not.toHaveBeenCalled()
  await user.keyboard('{Escape}')
  expect(first).toHaveFocus()
  const trigger = within(first).getByRole('button', {
    name: 'More actions: kick.wav',
  })
  fireEvent.dragStart(trigger)
  expect(api.library.startDrag).not.toHaveBeenCalled()
  await user.click(trigger)
  expect(screen.getByRole('menuitem', { name: 'Pause preview' })).toBeVisible()
  expect(second).toHaveAttribute('aria-selected', 'true')
  await user.click(screen.getByRole('menuitem', { name: 'Add to Collection' }))
  expect(onAddToCollection).toHaveBeenCalledWith(kick)
  expect(second).toHaveAttribute('aria-selected', 'true')
  expect(preview.togglePreview).not.toHaveBeenCalled()
  await user.click(trigger)
  await user.click(screen.getByRole('menuitem', { name: 'Info' }))
  expect(onInspect).toHaveBeenCalledWith(kick, trigger)
  expect(first).toHaveAttribute('aria-selected', 'true')
  expect(preview.togglePreview).not.toHaveBeenCalled()
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  await user.click(
    within(second).getByRole('button', { name: 'More actions: snare.wav' }),
  )
  await user.click(screen.getByRole('menuitem', { name: 'Play preview' }))
  expect(preview.togglePreview).toHaveBeenLastCalledWith(snare)
  expect(first).toHaveAttribute('aria-selected', 'true')
})

test('unavailable Sample menus disable audio but keep Info usable and close when the row disappears', async () => {
  const user = userEvent.setup()
  const { preview } = setup()
  const sample = {
    ...snare,
    audioUrl: null,
    rootPath: '/fixtures',
    sourceRevision: 1,
    unavailableReason: 'Audio unavailable.',
  }
  const onInspect = vi.fn()
  const { rerender } = render(
    <SampleList
      samples={[kick, sample]}
      preview={preview}
      onFavoriteChanged={vi.fn()}
      onInspect={onInspect}
    />,
  )
  const row = screen.getAllByRole('row')[1]
  row.focus()
  await user.keyboard('{Shift>}{F10}{/Shift}')
  expect(screen.getByRole('menuitem', { name: 'Play preview' })).toBeDisabled()
  expect(screen.getByRole('menuitem', { name: 'Info' })).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(onInspect).toHaveBeenCalledWith(sample, row)
  expect(preview.togglePreview).not.toHaveBeenCalled()
  await user.click(
    within(row).getByRole('button', { name: 'More actions: snare.wav' }),
  )
  rerender(
    <SampleList
      samples={[kick]}
      preview={preview}
      onFavoriteChanged={vi.fn()}
      onInspect={onInspect}
    />,
  )
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

test('Collection handles reorder with internal drag data and a drop marker without exporting audio; cancellation and external drops do nothing', async () => {
  const { api, preview } = setup()
  const onPlace = vi.fn()
  const onMove = vi.fn()
  function Ordered({
    token = 'a'.repeat(64),
  }: {
    token?: string
  }): React.JSX.Element {
    const [id, onChange] = useState<string | null>(null)
    const drag = useCollectionDrag({
      collectionId: 'collection',
      token,
      enabled: true,
      offset: 0,
      onSelect: (sample) => onChange(sample.id),
      onPlace,
    })
    return (
      <SampleList
        samples={[kick, snare]}
        preview={preview}
        onFavoriteChanged={vi.fn()}
        selection={{ id, onChange }}
        order={{ drag, offset: 0, total: 2, onMove }}
      />
    )
  }
  const { rerender } = render(<Ordered />)
  const [first, second] = screen.getAllByRole('row')
  vi.spyOn(second, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 300,
    bottom: 100,
    width: 300,
    height: 100,
    toJSON: () => ({}),
  })
  const handle = within(first).getByRole('button', { name: 'Reorder kick.wav' })
  const dataTransfer = transfer()
  fireEvent.dragStart(handle, { dataTransfer })
  expect(first).toHaveAttribute('aria-selected', 'true')
  expect(dataTransfer.types).toEqual([COLLECTION_REORDER_MIME])
  expect(api.library.startDrag).not.toHaveBeenCalled()
  dragEvent(second, 'dragover', dataTransfer, 25)
  expect(second).toHaveAttribute('data-order-drop', 'before')
  expect(onPlace).not.toHaveBeenCalled()
  dragEvent(second, 'drop', dataTransfer, 25)
  expect(onPlace).toHaveBeenCalledWith(
    { id: kick.id, relativePath: kick.relativePath },
    snare.id,
    'before',
    'a'.repeat(64),
  )
  expect(second).not.toHaveAttribute('data-order-drop')
  expect(preview.togglePreview).not.toHaveBeenCalled()
  onPlace.mockClear()
  fireEvent.dragStart(handle, { dataTransfer })
  dragEvent(second, 'dragover', dataTransfer, 75)
  fireEvent.dragEnd(handle, { dataTransfer })
  expect(second).not.toHaveAttribute('data-order-drop')
  expect(onPlace).not.toHaveBeenCalled()
  const external = transfer()
  external.setData('Files', '/untrusted.wav')
  dragEvent(second, 'drop', external, 75)
  expect(onPlace).not.toHaveBeenCalled()
  fireEvent.dragStart(handle, { dataTransfer })
  dragEvent(first, 'drop', dataTransfer, 75)
  expect(onPlace).not.toHaveBeenCalled()
  fireEvent.dragStart(handle, { dataTransfer })
  rerender(<Ordered token={'b'.repeat(64)} />)
  dragEvent(second, 'drop', dataTransfer, 75)
  expect(onPlace).not.toHaveBeenCalled()
  fireEvent.dragStart(within(first).getByTestId('sample-name'))
  expect(api.library.startDrag).toHaveBeenCalledWith(kick.audioUrl)
  expect(api.library.startDrag).toHaveBeenCalledTimes(1)
  fireEvent.dragStart(
    within(first).getByRole('img', { name: 'Waveform of kick.wav' }),
  )
  expect(api.library.startDrag).toHaveBeenCalledTimes(2)
  expect(onPlace).not.toHaveBeenCalled()
  expect(preview.togglePreview).not.toHaveBeenCalled()
})
