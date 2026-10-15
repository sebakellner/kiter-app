import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { useLibrary } from './useLibrary'
import { OpenFolderButton } from '../components/OpenFolderButton'
import { createTestApi } from '../../../../../../tests/support/ui/bridge'
import { makeAudioSample } from '../../../../../../tests/support/fixtures/audio-sample'
import { deferred } from '../../../../../../tests/support/fixtures/deferred'
import type { IpcResult } from '@shared/ipc'

function LibraryHarness(): React.JSX.Element {
  const library = useLibrary()
  return (
    <>
      <OpenFolderButton
        loading={library.loading}
        onClick={() => void library.openFolder()}
      />
      <p aria-label="Selected folder">{library.dir ?? 'No folder'}</p>
      <ul aria-label="Samples">
        {library.files.map((file) => (
          <li key={file.id}>{file.relativePath}</li>
        ))}
      </ul>
      {library.error && <p role="alert">{library.error}</p>}
    </>
  )
}

test('keeps the current folder and samples when selection is canceled or the next import fails', async () => {
  const api = createTestApi()
  api.dialog.openFolder
    .mockResolvedValueOnce({ ok: true, data: '/fixtures/first' })
    .mockResolvedValueOnce({ ok: true, data: null })
    .mockResolvedValueOnce({ ok: true, data: '/fixtures/missing' })
  api.library.importFolder
    .mockResolvedValueOnce({ ok: true, data: [makeAudioSample()] })
    .mockResolvedValueOnce({
      ok: false,
      error: { code: 'STORAGE_FAILED', message: 'Unable to read the folder.' },
    })
  vi.stubGlobal('api', api)
  const user = userEvent.setup()
  render(<LibraryHarness />)

  await user.click(screen.getByRole('button', { name: 'Open folder' }))
  expect(await screen.findByText('kick.wav')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Open folder' }))
  expect(screen.getByLabelText('Selected folder')).toHaveTextContent(
    '/fixtures/first',
  )
  expect(screen.getByRole('list', { name: 'Samples' })).toHaveTextContent(
    'kick.wav',
  )
  expect(api.library.importFolder).toHaveBeenCalledTimes(1)

  await user.click(screen.getByRole('button', { name: 'Open folder' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Unable to read the folder.',
  )
  expect(screen.getByLabelText('Selected folder')).toHaveTextContent(
    '/fixtures/first',
  )
  expect(screen.getByRole('list', { name: 'Samples' })).toHaveTextContent(
    'kick.wav',
  )
  expect(screen.getByRole('button', { name: 'Open folder' })).toBeEnabled()
})

test('opens one dialog for repeated clicks and recovers after pending cancellation', async () => {
  const api = createTestApi()
  const selection = deferred<IpcResult<string | null>>()
  api.dialog.openFolder
    .mockReturnValueOnce(selection.promise)
    .mockResolvedValueOnce({ ok: true, data: null })
  vi.stubGlobal('api', api)
  const user = userEvent.setup()
  render(<LibraryHarness />)

  await user.dblClick(screen.getByRole('button', { name: 'Open folder' }))

  expect(
    screen.getByRole('button', { name: 'Loading folder...' }),
  ).toBeDisabled()
  expect(api.dialog.openFolder).toHaveBeenCalledTimes(1)
  selection.resolve({ ok: true, data: null })
  await screen.findByRole('button', { name: 'Open folder' })
  await user.click(screen.getByRole('button', { name: 'Open folder' }))
  expect(api.dialog.openFolder).toHaveBeenCalledTimes(2)
  expect(api.library.importFolder).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Selected folder')).toHaveTextContent(
    'No folder',
  )
})
