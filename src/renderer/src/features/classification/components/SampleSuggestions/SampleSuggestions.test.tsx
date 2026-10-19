import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { SampleSuggestions } from './SampleSuggestions'
import { createTestApi } from '../../../../../../../tests/support/ui/bridge'
import { deferred } from '../../../../../../../tests/support/fixtures/deferred'
import type { IpcResult } from '@shared/ipc/result'
import type {
  ClassificationPreparationItem,
  ClassificationPreparationPage,
} from '@shared/ipc/classification'

function item(
  key: string,
  overrides: Partial<ClassificationPreparationItem> = {},
): ClassificationPreparationItem {
  return {
    kind: 'proposal',
    dimension: 'instrument',
    key,
    name: key,
    entityId: null,
    alreadyAssigned: false,
    needsCreation: true,
    evidence: 'Cataloged location: kick.wav',
    clue: 'kick',
    rule: 'name',
    reason: null,
    ...overrides,
  }
}
function page(
  items: ClassificationPreparationItem[],
  overrides: Partial<ClassificationPreparationPage> = {},
): ClassificationPreparationPage {
  return {
    sampleId: 'sample',
    sampleName: 'Kick',
    token: 'a'.repeat(64),
    proposalCount: items.length,
    ambiguityCount: 0,
    items,
    total: items.length,
    limit: 100,
    offset: 0,
    ...overrides,
  }
}

test('automatically groups suggestions and applies one directly, then displays saved classification', async () => {
  const api = createTestApi()
  vi.stubGlobal('api', api)
  api.classification.prepareSample
    .mockResolvedValueOnce({
      ok: true,
      data: page([
        item('Kick'),
        item('Kick', { evidence: 'Cataloged location: Kicks' }),
      ]),
    })
    .mockResolvedValueOnce({
      ok: true,
      data: page([
        item('Kick', {
          kind: 'assigned',
          alreadyAssigned: true,
          needsCreation: false,
        }),
      ]),
    })
  api.classification.applySample.mockResolvedValueOnce({
    ok: true,
    data: { sampleId: 'sample' },
  })
  const user = userEvent.setup()
  render(<SampleSuggestions sampleId="sample" />)
  const apply = await screen.findByRole('button', { name: 'Apply Kick' })
  expect(
    screen.queryByRole('button', { name: 'Suggest classifications' }),
  ).not.toBeInTheDocument()
  expect(screen.getByText('Creates Kick when applied.')).toBeVisible()
  await user.click(apply)
  expect(api.classification.applySample).toHaveBeenCalledWith({
    sampleId: 'sample',
    token: 'a'.repeat(64),
    keys: ['Kick'],
  })
  expect(await screen.findByText('Classifications saved.')).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Apply Kick' }),
  ).not.toBeInTheDocument()
  expect(screen.getByText('Kick')).toBeVisible()
})

test('Apply all includes all paginated suggestions but excludes ambiguous and assigned entries', async () => {
  const api = createTestApi()
  vi.stubGlobal('api', api)
  api.classification.prepareSample
    .mockResolvedValueOnce({
      ok: true,
      data: page([item('Kick')], { total: 4 }),
    })
    .mockResolvedValueOnce({
      ok: true,
      data: page(
        [
          item('Snare'),
          item('Bass', { kind: 'ambiguity', reason: 'conflicting-targets' }),
          item('Drums', { kind: 'assigned', alreadyAssigned: true }),
        ],
        { total: 4, offset: 1 },
      ),
    })
  api.classification.applySample.mockResolvedValueOnce({
    ok: false,
    error: { code: 'STALE_REVIEW', message: 'Suggestions changed.' },
  })
  const user = userEvent.setup()
  render(<SampleSuggestions sampleId="sample" />)
  await user.click(await screen.findByRole('button', { name: 'Apply all (2)' }))
  expect(api.classification.applySample).toHaveBeenCalledWith({
    sampleId: 'sample',
    token: 'a'.repeat(64),
    keys: ['Kick', 'Snare'],
  })
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Suggestions changed.',
  )
  expect(screen.getByRole('button', { name: 'Apply Kick' })).toBeDisabled()
})

test('load errors offer refresh and late responses cannot replace another inspected Sample', async () => {
  const api = createTestApi()
  vi.stubGlobal('api', api)
  api.classification.prepareSample
    .mockResolvedValueOnce({
      ok: false,
      error: { code: 'STORAGE_FAILED', message: 'Catalog unavailable.' },
    })
    .mockResolvedValueOnce({ ok: true, data: page([]) })
  const user = userEvent.setup()
  const first = render(<SampleSuggestions sampleId="sample" />)
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Catalog unavailable.',
  )
  await user.click(screen.getByRole('button', { name: 'Refresh suggestions' }))
  expect(await screen.findByText(/No classification clues found/)).toBeVisible()
  first.unmount()
  const pending = deferred<IpcResult<ClassificationPreparationPage>>()
  api.classification.prepareSample
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce({ ok: true, data: page([]) })
  const { rerender } = render(
    <SampleSuggestions key="first" sampleId="first" />,
  )
  rerender(<SampleSuggestions key="second" sampleId="second" />)
  await act(async () =>
    pending.resolve({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Old Sample disappeared.' },
    }),
  )
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
