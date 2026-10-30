import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import type { Author, Instrument } from '@shared/domain/classification'
import type { Page } from '@shared/domain/pagination'
import type { PackSample } from '@shared/domain/pack'
import type { Genre } from '@shared/domain/recognition'
import type {
  PackDetail,
  PackListItem,
  PackListPage,
  PackSamplesPage,
} from '@shared/ipc/packs'
import type { IpcResult } from '@shared/ipc/result'
import { Packs } from './Packs'
import { PackDetail as PackDetailView } from './PackDetail'
import { createTestApi } from '../../../../../tests/support/ui/bridge'
import { deferred } from '../../../../../tests/support/fixtures/deferred'
import { makePack } from '../../../../../tests/support/fixtures/pack'

const PACK_ID = '11111111-1111-4111-8111-111111111111'
const BETA_ID = '22222222-2222-4222-8222-222222222222'

const alpha = makePack({
  id: PACK_ID,
  name: 'Alpha Breaks',
  description: 'Rugged drum loops.',
  coverAssetId: '00000000-0000-4000-8000-000000000003',
})
const beta = makePack({
  id: BETA_ID,
  sourceRootId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  name: 'Beta Textures',
})

function bounded<Item>(items: Item[], total = items.length): Page<Item> {
  return { items, total, limit: 50, offset: 0 }
}

function entity<Item extends Instrument | Author | Genre>(
  name: string,
  index: number,
): Item {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    name,
  } as Item
}

function makeDetail(overrides: Partial<PackDetail> = {}): PackDetail {
  return {
    pack: alpha,
    instruments: bounded(
      [entity<Instrument>('Kick', 1), entity<Instrument>('Snare', 2)],
      7,
    ),
    authors: bounded([entity<Author>('Ada', 3)]),
    genres: bounded<Genre>([], 0),
    ...overrides,
  }
}

function sample(index: number, name: string): PackSample {
  return {
    sampleId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    packId: PACK_ID,
    originAssignment: 'automatic',
    name,
    path: `/library/alpha-breaks/${name}`,
  }
}

function detailResult(detail: PackDetail): IpcResult<PackDetail> {
  return { ok: true, data: detail }
}

function samplesPage(
  items: PackSample[],
  overrides: Partial<PackSamplesPage> = {},
): IpcResult<PackSamplesPage> {
  return {
    ok: true,
    data: { items, total: items.length, limit: 50, offset: 0, ...overrides },
  }
}

function packsPage(items: PackListItem[]): IpcResult<PackListPage> {
  return {
    ok: true,
    data: { items, total: items.length, limit: 50, offset: 0 },
  }
}

function setup(): {
  api: ReturnType<typeof createTestApi>
} {
  const api = createTestApi()
  vi.stubGlobal('api', api)
  return { api }
}

function renderDetail(id = PACK_ID): ReturnType<typeof createMemoryRouter> {
  const router = createMemoryRouter(
    [
      { path: '/packs', element: <Packs /> },
      { path: '/packs/:id', element: <PackDetailView /> },
    ],
    { initialEntries: [`/packs/${id}`] },
  )
  render(<RouterProvider router={router} />)
  return router
}

test('renders the Pack header with its cover, name, description and bounded groups', async () => {
  const { api } = setup()
  api.packs.detail.mockResolvedValue(detailResult(makeDetail()))
  api.packs.samples.mockResolvedValue(samplesPage([]))
  renderDetail()

  expect(
    await screen.findByRole('heading', { name: 'Alpha Breaks', level: 1 }),
  ).toBeVisible()
  expect(api.packs.detail).toHaveBeenCalledExactlyOnceWith({ id: PACK_ID })
  expect(screen.getByText('Rugged drum loops.')).toBeVisible()
  // No managed-image path reaches the renderer for Pack covers, so the header
  // states the gap instead of showing a broken image.
  expect(
    screen.getByRole('img', { name: 'Pack cover placeholder' }),
  ).toBeVisible()
  expect(screen.getByRole('link', { name: 'Packs' })).toHaveAttribute(
    'href',
    '/packs',
  )

  // Instruments, Authors and Genres are bounded pages: each one reports the
  // total it read against, never just the items that arrived.
  expect(screen.getByText('Showing 2 of 7 Instruments.')).toBeVisible()
  expect(screen.getByText('Kick')).toBeVisible()
  expect(screen.getByText('Snare')).toBeVisible()
  expect(screen.getByText('Showing 1 of 1 Author.')).toBeVisible()
  expect(screen.getByText('Ada')).toBeVisible()
  expect(screen.getByText('No Genres assigned.')).toBeVisible()
})

test('pages the Samples under the Pack and stops at the last page', async () => {
  const user = userEvent.setup()
  const { api } = setup()
  api.packs.detail.mockResolvedValue(detailResult(makeDetail()))
  const pages: Record<number, IpcResult<PackSamplesPage>> = {
    0: samplesPage([sample(1, 'First Kick'), sample(2, 'Second Kick')], {
      total: 3,
      limit: 2,
    }),
    2: samplesPage([sample(3, 'Third Kick')], {
      total: 3,
      limit: 2,
      offset: 2,
    }),
  }
  api.packs.samples.mockImplementation(
    async (request) => pages[request.offset ?? 0],
  )
  renderDetail()

  const first = await screen.findByRole('row', { name: /First Kick/ })
  expect(
    within(first).getByText('/library/alpha-breaks/First Kick'),
  ).toBeVisible()
  expect(within(first).getByText('Automatic origin')).toBeVisible()
  expect(screen.getByText('1–2 of 3')).toBeVisible()
  expect(api.packs.samples).toHaveBeenCalledExactlyOnceWith({
    id: PACK_ID,
    offset: 0,
  })

  await user.click(screen.getByRole('button', { name: 'Next page' }))
  expect(await screen.findByRole('row', { name: /Third Kick/ })).toBeVisible()
  expect(
    screen.queryByRole('row', { name: /First Kick/ }),
  ).not.toBeInTheDocument()
  expect(screen.getByText('3–3 of 3')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
  expect(api.packs.samples.mock.calls).toEqual([
    [{ id: PACK_ID, offset: 0 }],
    [{ id: PACK_ID, offset: 2 }],
  ])

  await user.click(screen.getByRole('button', { name: 'Previous page' }))
  expect(await screen.findByRole('row', { name: /First Kick/ })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
})

test('shows the header and the Samples list loading states until each read arrives', async () => {
  const { api } = setup()
  const detailPending = deferred<IpcResult<PackDetail>>()
  const samplesPending = deferred<IpcResult<PackSamplesPage>>()
  api.packs.detail.mockReturnValue(detailPending.promise)
  api.packs.samples.mockReturnValue(samplesPending.promise)
  renderDetail()

  expect(screen.getByText('Loading Pack…')).toBeVisible()
  expect(screen.getByText('Loading Samples…')).toBeVisible()
  expect(screen.queryByRole('heading', { name: 'Alpha Breaks' })).toBeNull()

  await act(async () => detailPending.resolve(detailResult(makeDetail())))
  expect(
    await screen.findByRole('heading', { name: 'Alpha Breaks', level: 1 }),
  ).toBeVisible()
  expect(screen.queryByText('Loading Pack…')).not.toBeInTheDocument()
  expect(screen.getByText('Loading Samples…')).toBeVisible()

  await act(async () =>
    samplesPending.resolve(samplesPage([sample(1, 'First Kick')])),
  )
  expect(await screen.findByRole('row', { name: /First Kick/ })).toBeVisible()
  expect(screen.queryByText('Loading Samples…')).not.toBeInTheDocument()
})

test('states an empty Samples list without claiming the Pack is empty of anything else', async () => {
  const { api } = setup()
  api.packs.detail.mockResolvedValue(detailResult(makeDetail()))
  api.packs.samples.mockResolvedValue(samplesPage([], { total: 0 }))
  renderDetail()

  expect(await screen.findByText('No Samples in this Pack.')).toBeVisible()
  expect(
    screen.getByRole('heading', { name: 'Alpha Breaks', level: 1 }),
  ).toBeVisible()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

test('reports a Pack that no longer exists and retries it', async () => {
  const user = userEvent.setup()
  const { api } = setup()
  api.packs.detail.mockResolvedValueOnce({
    ok: false,
    error: { code: 'NOT_FOUND', message: 'The Pack no longer exists.' },
  })
  api.packs.samples.mockResolvedValue(samplesPage([sample(1, 'First Kick')]))
  renderDetail()

  expect(
    await screen.findByRole('heading', { name: 'Pack unavailable', level: 1 }),
  ).toBeVisible()
  const alert = screen.getByRole('alert')
  expect(alert).toHaveTextContent('The Pack no longer exists.')
  expect(screen.getByRole('link', { name: 'Packs' })).toHaveAttribute(
    'href',
    '/packs',
  )

  api.packs.detail.mockResolvedValueOnce(detailResult(makeDetail()))
  await user.click(within(alert).getByRole('button', { name: 'Retry' }))
  expect(
    await screen.findByRole('heading', { name: 'Alpha Breaks', level: 1 }),
  ).toBeVisible()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(api.packs.detail.mock.calls).toEqual([
    [{ id: PACK_ID }],
    [{ id: PACK_ID }],
  ])
})

test('a failed Pack read keeps the Samples list and retries only that read', async () => {
  const user = userEvent.setup()
  const { api } = setup()
  api.packs.detail.mockRejectedValueOnce(new Error('Unable to read the Pack.'))
  api.packs.samples.mockResolvedValue(samplesPage([sample(1, 'First Kick')]))
  renderDetail()

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Unable to read the Pack.')
  expect(await screen.findByRole('row', { name: /First Kick/ })).toBeVisible()

  api.packs.detail.mockResolvedValueOnce(detailResult(makeDetail()))
  await user.click(within(alert).getByRole('button', { name: 'Retry' }))
  expect(
    await screen.findByRole('heading', { name: 'Alpha Breaks', level: 1 }),
  ).toBeVisible()
  expect(screen.getByRole('row', { name: /First Kick/ })).toBeVisible()
  expect(api.packs.samples).toHaveBeenCalledExactlyOnceWith({
    id: PACK_ID,
    offset: 0,
  })
})

test('a failed Samples read keeps the Pack header and retries only that page', async () => {
  const user = userEvent.setup()
  const { api } = setup()
  api.packs.detail.mockResolvedValue(detailResult(makeDetail()))
  api.packs.samples.mockRejectedValueOnce(
    new Error('Unable to read Pack Samples.'),
  )
  renderDetail()

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Unable to read Pack Samples.')
  expect(
    screen.getByRole('heading', { name: 'Alpha Breaks', level: 1 }),
  ).toBeVisible()
  expect(screen.getByText('Showing 2 of 7 Instruments.')).toBeVisible()

  api.packs.samples.mockResolvedValueOnce(
    samplesPage([sample(1, 'First Kick')]),
  )
  await user.click(within(alert).getByRole('button', { name: 'Retry' }))
  expect(await screen.findByRole('row', { name: /First Kick/ })).toBeVisible()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(api.packs.samples.mock.calls).toEqual([
    [{ id: PACK_ID, offset: 0 }],
    [{ id: PACK_ID, offset: 0 }],
  ])
  expect(api.packs.detail).toHaveBeenCalledExactlyOnceWith({ id: PACK_ID })
})

test('the list opens the Pack an activation names without touching checks or inspection', async () => {
  const user = userEvent.setup()
  const { api } = setup()
  api.packs.list.mockResolvedValue(packsPage([alpha, beta]))
  api.packs.detail.mockResolvedValue(
    detailResult(
      makeDetail({
        pack: beta,
        instruments: bounded([]),
        authors: bounded([]),
      }),
    ),
  )
  api.packs.samples.mockResolvedValue(samplesPage([]))
  const router = createMemoryRouter(
    [
      { path: '/packs', element: <Packs /> },
      { path: '/packs/:id', element: <PackDetailView /> },
    ],
    { initialEntries: ['/packs'] },
  )
  render(<RouterProvider router={router} />)

  const alphaRow = await screen.findByRole('row', { name: /Alpha Breaks/ })
  await user.click(alphaRow)
  expect(alphaRow).toHaveAttribute('aria-selected', 'true')
  // Checking the other Pack neither opens it nor moves the inspected row.
  await user.click(
    screen.getByRole('checkbox', { name: 'Select Pack Beta Textures' }),
  )
  expect(screen.getByText('1 selected')).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Packs', level: 1 })).toBeVisible()
  expect(alphaRow).toHaveAttribute('aria-selected', 'true')

  await user.click(screen.getByRole('link', { name: 'Open Beta Textures' }))
  expect(
    await screen.findByRole('heading', { name: 'Beta Textures', level: 1 }),
  ).toBeVisible()
  expect(api.packs.detail).toHaveBeenCalledExactlyOnceWith({ id: BETA_ID })
  expect(api.packs.list.mock.calls).toEqual([[{ offset: 0 }]])
})

test('the row itself opens its Pack on Enter and on a double click', async () => {
  const user = userEvent.setup()
  const { api } = setup()
  api.packs.list.mockResolvedValue(packsPage([alpha, beta]))
  api.packs.detail.mockImplementation(async ({ id }) =>
    detailResult(
      makeDetail({
        pack: id === BETA_ID ? beta : alpha,
        instruments: bounded([]),
        authors: bounded([]),
      }),
    ),
  )
  api.packs.samples.mockResolvedValue(samplesPage([]))
  const router = createMemoryRouter(
    [
      { path: '/packs', element: <Packs /> },
      { path: '/packs/:id', element: <PackDetailView /> },
    ],
    { initialEntries: ['/packs'] },
  )
  render(<RouterProvider router={router} />)

  const alphaRow = await screen.findByRole('row', { name: /Alpha Breaks/ })
  alphaRow.focus()
  await user.keyboard('{Enter}')
  expect(
    await screen.findByRole('heading', { name: 'Alpha Breaks', level: 1 }),
  ).toBeVisible()

  await act(async () => {
    await router.navigate(-1)
  })
  const betaRow = await screen.findByRole('row', { name: /Beta Textures/ })
  await user.dblClick(betaRow)
  expect(
    await screen.findByRole('heading', { name: 'Beta Textures', level: 1 }),
  ).toBeVisible()
  expect(api.packs.detail.mock.calls).toEqual([
    [{ id: PACK_ID }],
    [{ id: BETA_ID }],
  ])
})
