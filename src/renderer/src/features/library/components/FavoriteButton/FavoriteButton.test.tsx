import { useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import type { FavoriteState, IpcResult } from '@shared/ipc'
import { FavoriteButton } from './FavoriteButton'
import { createTestApi } from '../../../../../../../tests/support/ui/bridge'
import { makeAudioSample } from '../../../../../../../tests/support/fixtures/audio-sample'
import { deferred } from '../../../../../../../tests/support/fixtures/deferred'

function FavoriteHarness(): React.JSX.Element {
  const [file, setFile] = useState(makeAudioSample)
  return (
    <FavoriteButton
      file={file}
      onChanged={(saved) => setFile((current) => ({ ...current, ...saved }))}
    />
  )
}

describe('FavoriteButton', () => {
  test('prevents duplicate writes while pending and presents the confirmed state', async () => {
    const api = createTestApi()
    const pending = deferred<IpcResult<FavoriteState>>()
    api.library.setFavorite.mockReturnValue(pending.promise)
    vi.stubGlobal('api', api)
    const user = userEvent.setup()
    render(<FavoriteHarness />)
    const button = screen.getByRole('button', {
      name: 'Add favorite: kick.wav',
    })

    await user.dblClick(button)

    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(api.library.setFavorite).toHaveBeenCalledExactlyOnceWith(
      makeAudioSample().id,
      true,
    )
    await act(async () =>
      pending.resolve({
        ok: true,
        data: { id: makeAudioSample().id, favorite: true },
      }),
    )
    expect(
      screen.getByRole('button', { name: 'Remove favorite: kick.wav' }),
    ).toBeEnabled()
    expect(button).toHaveAttribute('aria-pressed', 'true')
  })

  test('preserves the previous state on failure and allows a successful retry', async () => {
    const api = createTestApi()
    const file = makeAudioSample()
    api.library.setFavorite
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'STORAGE_FAILED', message: 'Unable to save favorite.' },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { id: file.id, favorite: true },
      })
    vi.stubGlobal('api', api)
    const user = userEvent.setup()
    render(<FavoriteHarness />)
    const button = screen.getByRole('button', {
      name: 'Add favorite: kick.wav',
    })

    await user.click(button)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to save favorite.',
    )
    expect(button).toBeEnabled()
    expect(button).toHaveAttribute('aria-pressed', 'false')
    await user.click(button)
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test('does not present a late failure after unmount', async () => {
    const api = createTestApi()
    const pending = deferred<IpcResult<FavoriteState>>()
    api.library.setFavorite.mockReturnValue(pending.promise)
    vi.stubGlobal('api', api)
    const user = userEvent.setup()
    const onChanged = vi.fn()
    const view = render(
      <FavoriteButton file={makeAudioSample()} onChanged={onChanged} />,
    )
    await user.click(
      screen.getByRole('button', { name: 'Add favorite: kick.wav' }),
    )
    view.unmount()

    await act(async () =>
      pending.resolve({
        ok: false,
        error: { code: 'STORAGE_FAILED', message: 'Unable to save favorite.' },
      }),
    )

    expect(onChanged).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
