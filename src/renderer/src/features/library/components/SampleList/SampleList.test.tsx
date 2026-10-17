import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
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
