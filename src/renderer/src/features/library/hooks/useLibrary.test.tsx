import { useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { useLibrary, type FolderImportOutcome } from './useLibrary'
import { createTestApi } from '../../../../../../tests/support/ui/bridge'
import { makeAudioSample } from '../../../../../../tests/support/fixtures/audio-sample'
import { deferred } from '../../../../../../tests/support/fixtures/deferred'
import type { AudioSample, IpcResult } from '@shared/ipc'

const SECOND_SAMPLE_ID = '00000000-0000-4000-8000-000000000002'

function LibraryHarness({
  directories,
}: {
  directories: string[]
}): React.JSX.Element {
  const library = useLibrary()
  const [outcomes, setOutcomes] = useState<FolderImportOutcome[]>([])
  return (
    <>
      <button
        onClick={() => {
          void library.importFolders(directories).then(setOutcomes)
        }}
      >
        Import folders
      </button>
      <p aria-label="Import state">{library.loading ? 'Importing' : 'Idle'}</p>
      <p aria-label="Selected folder">{library.dir ?? 'No folder'}</p>
      <ul aria-label="Samples">
        {library.files.map((file) => (
          <li key={file.id}>{file.relativePath}</li>
        ))}
      </ul>
      <ul aria-label="Folder outcomes">
        {outcomes.map((outcome) => (
          <li key={outcome.directory}>
            {outcome.directory}: {outcome.sampleCount ?? 'failed'}
            {outcome.error && ` (${outcome.error})`}
          </li>
        ))}
      </ul>
      {library.error && <p role="alert">{library.error}</p>}
    </>
  )
}

test('imports one folder per request and reports every folder outcome', async () => {
  const api = createTestApi()
  api.library.importFolder
    .mockResolvedValueOnce({ ok: true, data: [makeAudioSample()] })
    .mockResolvedValueOnce({
      ok: true,
      data: [
        makeAudioSample({ id: SECOND_SAMPLE_ID, relativePath: 'snare.wav' }),
      ],
    })
  vi.stubGlobal('api', api)
  const user = userEvent.setup()
  render(
    <LibraryHarness directories={['/fixtures/first', '/fixtures/second']} />,
  )

  await user.click(screen.getByRole('button', { name: 'Import folders' }))

  const outcomes = screen.getByRole('list', { name: 'Folder outcomes' })
  await waitFor(() =>
    expect(within(outcomes).getAllByRole('listitem')).toHaveLength(2),
  )
  expect(
    within(outcomes)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(['/fixtures/first: 1', '/fixtures/second: 1'])
  expect(api.library.importFolder.mock.calls).toEqual([
    ['/fixtures/first'],
    ['/fixtures/second'],
  ])
  expect(screen.getByLabelText('Selected folder')).toHaveTextContent(
    '/fixtures/second',
  )
  expect(screen.getByRole('list', { name: 'Samples' })).toHaveTextContent(
    'snare.wav',
  )
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Import state')).toHaveTextContent('Idle')
})

test('keeps the current folder and samples when a folder fails and reports that folder', async () => {
  const api = createTestApi()
  api.library.importFolder
    .mockResolvedValueOnce({ ok: true, data: [makeAudioSample()] })
    .mockResolvedValueOnce({
      ok: false,
      error: { code: 'STORAGE_FAILED', message: 'Unable to read the folder.' },
    })
  vi.stubGlobal('api', api)
  const user = userEvent.setup()
  render(
    <LibraryHarness directories={['/fixtures/first', '/fixtures/missing']} />,
  )

  await user.click(screen.getByRole('button', { name: 'Import folders' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '1 of 2 folders could not be imported. Unable to read the folder.',
  )
  expect(screen.getByLabelText('Selected folder')).toHaveTextContent(
    '/fixtures/first',
  )
  expect(screen.getByRole('list', { name: 'Samples' })).toHaveTextContent(
    'kick.wav',
  )
  expect(
    screen.getByRole('list', { name: 'Folder outcomes' }),
  ).toHaveTextContent('/fixtures/missing: failed (Unable to read the folder.)')
  expect(screen.getByLabelText('Import state')).toHaveTextContent('Idle')
})

test('reports a failed folder message unchanged when every folder fails', async () => {
  const api = createTestApi()
  api.library.importFolder.mockResolvedValue({
    ok: false,
    error: { code: 'STORAGE_FAILED', message: 'Unable to read the folder.' },
  })
  vi.stubGlobal('api', api)
  const user = userEvent.setup()
  render(<LibraryHarness directories={['/fixtures/missing']} />)

  await user.click(screen.getByRole('button', { name: 'Import folders' }))

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Unable to read the folder.')
  expect(alert).not.toHaveTextContent('folders could not be imported')
  expect(screen.getByLabelText('Selected folder')).toHaveTextContent(
    'No folder',
  )
  expect(screen.getByRole('list', { name: 'Samples' })).not.toHaveTextContent(
    'kick.wav',
  )
})

test('shows the pending state and ignores a second import while the first runs', async () => {
  const api = createTestApi()
  const first = deferred<IpcResult<AudioSample[]>>()
  api.library.importFolder
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce({ ok: true, data: [] })
  vi.stubGlobal('api', api)
  const user = userEvent.setup()
  render(<LibraryHarness directories={['/fixtures/first']} />)

  await user.dblClick(screen.getByRole('button', { name: 'Import folders' }))

  expect(screen.getByLabelText('Import state')).toHaveTextContent('Importing')
  expect(api.library.importFolder).toHaveBeenCalledTimes(1)
  first.resolve({ ok: true, data: [makeAudioSample()] })
  expect(await screen.findByText('kick.wav')).toBeInTheDocument()
  expect(screen.getByLabelText('Import state')).toHaveTextContent('Idle')
  expect(api.library.importFolder).toHaveBeenCalledTimes(1)
})
