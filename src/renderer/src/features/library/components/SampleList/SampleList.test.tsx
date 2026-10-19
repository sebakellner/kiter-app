import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { useState } from 'react'
import { SampleList } from './SampleList'
import type { PreviewController } from '../../hooks/usePreview'
import { makeAudioSample } from '../../../../../../../tests/support/fixtures/audio-sample'
import { createTestApi } from '../../../../../../../tests/support/ui/bridge'

vi.mock('../Waveform', () => ({ Waveform: () => null }))

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
  expect(second).toHaveAttribute('aria-selected', 'true')
  fireEvent.dragStart(within(first).getByTestId('preview-toggle'))
  expect(api.library.startDrag).toHaveBeenCalledTimes(1)

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
