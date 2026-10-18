import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { SampleSuggestions } from './SampleSuggestions'
import { createTestApi } from '../../../../../../../tests/support/ui/bridge'
import { deferred } from '../../../../../../../tests/support/fixtures/deferred'
import type { IpcResult } from '@shared/ipc/result'
import type { ClassificationPreparationPage } from '@shared/ipc/classification'

test('suggestions load only on request, explain empty results and recover from a failed preparation', async () => {
  const api = createTestApi()
  vi.stubGlobal('api', api)
  api.classification.prepareSample
    .mockResolvedValueOnce({
      ok: false,
      error: { code: 'STORAGE_FAILED', message: 'Catalog unavailable.' },
    })
    .mockResolvedValueOnce({
      ok: true,
      data: {
        sampleId: 'sample',
        sampleName: 'Kick',
        token: 'a'.repeat(64),
        proposalCount: 0,
        ambiguityCount: 0,
        items: [],
        total: 0,
        limit: 50,
        offset: 0,
      },
    })
  const user = userEvent.setup()
  render(<SampleSuggestions sampleId="sample" />)
  expect(api.classification.prepareSample).not.toHaveBeenCalled()
  await user.click(
    screen.getByRole('button', { name: 'Suggest classifications' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Catalog unavailable.',
  )
  await user.click(screen.getByRole('button', { name: 'Retry preparation' }))
  expect(await screen.findByText(/No classification clues found/)).toBeVisible()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('late preparation responses cannot replace the newly inspected Sample', async () => {
  const api = createTestApi()
  vi.stubGlobal('api', api)
  const pending = deferred<IpcResult<ClassificationPreparationPage>>()
  api.classification.prepareSample.mockReturnValueOnce(pending.promise)
  const user = userEvent.setup()
  const { rerender } = render(
    <SampleSuggestions key="first" sampleId="first" />,
  )
  await user.click(
    screen.getByRole('button', { name: 'Suggest classifications' }),
  )
  rerender(<SampleSuggestions key="second" sampleId="second" />)
  await act(async () =>
    pending.resolve({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Old Sample disappeared.' },
    }),
  )
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Suggest classifications' }),
  ).toBeEnabled()
})
