import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import type { PackListItem, PackListPage } from '@shared/ipc/packs'
import type { IpcResult } from '@shared/ipc/result'
import { Packs } from '@renderer/views/Packs/Packs'
import { createTestApi } from '../../../../../../../tests/support/ui/bridge'
import { deferred } from '../../../../../../../tests/support/fixtures/deferred'
import { makePack } from '../../../../../../../tests/support/fixtures/pack'
import { PackList } from './PackList'

const ALPHA_ID = '11111111-1111-4111-8111-111111111111'
const BETA_ID = '22222222-2222-4222-8222-222222222222'
const GAMMA_ID = '33333333-3333-4333-8333-333333333333'

const alpha = makePack({
  id: ALPHA_ID,
  name: 'Alpha Breaks',
  description: 'Rugged drum loops.',
})
const beta = makePack({
  id: BETA_ID,
  sourceRootId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  name: 'Beta Textures',
})
const gamma = makePack({
  id: GAMMA_ID,
  sourceRootId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  name: 'Gamma Hits',
})

function pageResult(
  items: PackListItem[],
  overrides: Partial<PackListPage> = {},
): IpcResult<PackListPage> {
  return {
    ok: true,
    data: {
      items,
      total: items.length,
      limit: 50,
      offset: 0,
      ...overrides,
    },
  }
}

function twoPages(offset: number): IpcResult<PackListPage> {
  return offset === 0
    ? pageResult([alpha, beta], { total: 3, limit: 2 })
    : pageResult([gamma], { total: 3, limit: 2, offset: 2 })
}

// Rows carry their own Open link, so the list renders inside the router it
// lives in even when a test never follows that link.
function renderInRouter(ui: React.ReactElement): ReturnType<typeof render> {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

function setup(): {
  api: ReturnType<typeof createTestApi>
  list: ReturnType<typeof createTestApi>['packs']['list']
} {
  const api = createTestApi()
  vi.stubGlobal('api', api)
  return { api, list: api.packs.list }
}

test('renders the first page of Packs on mount with its total', async () => {
  const { list } = setup()
  list.mockResolvedValue(pageResult([alpha, beta]))
  renderInRouter(<Packs />)

  const alphaRow = await screen.findByRole('row', { name: /Alpha Breaks/ })
  expect(alphaRow).toHaveTextContent('Rugged drum loops.')
  expect(screen.getByRole('row', { name: /Beta Textures/ })).toBeVisible()
  expect(list).toHaveBeenCalledExactlyOnceWith({ offset: 0 })
  expect(screen.getByText('2 Packs')).toBeVisible()
  expect(screen.getByText('1–2 of 2')).toBeVisible()
})

test('shows the loading state until the first page arrives', async () => {
  const { list } = setup()
  const pending = deferred<IpcResult<PackListPage>>()
  list.mockReturnValue(pending.promise)
  renderInRouter(<PackList />)

  expect(screen.getByText('Loading Packs…')).toBeVisible()
  expect(screen.queryByRole('grid')).not.toBeInTheDocument()

  await act(async () => pending.resolve(pageResult([alpha])))
  expect(await screen.findByRole('row', { name: /Alpha Breaks/ })).toBeVisible()
  expect(screen.queryByText('Loading Packs…')).not.toBeInTheDocument()
})

test('loads one page at a time and stops at the last page', async () => {
  const user = userEvent.setup()
  const { list } = setup()
  list.mockImplementation(async (request) => twoPages(request?.offset ?? 0))
  renderInRouter(<PackList />)

  await screen.findByRole('row', { name: /Alpha Breaks/ })
  await user.click(screen.getByRole('button', { name: 'Next page' }))

  expect(await screen.findByRole('row', { name: /Gamma Hits/ })).toBeVisible()
  expect(list.mock.calls).toEqual([[{ offset: 0 }], [{ offset: 2 }]])
  expect(
    screen.queryByRole('row', { name: /Alpha Breaks/ }),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
})

test('keeps checked Packs across page changes while the inspected row does not survive', async () => {
  const user = userEvent.setup()
  const { list } = setup()
  list.mockImplementation(async (request) => twoPages(request?.offset ?? 0))
  renderInRouter(<PackList />)

  await user.click(await screen.findByRole('row', { name: /Alpha Breaks/ }))
  await user.click(
    screen.getByRole('checkbox', { name: 'Select Pack Alpha Breaks' }),
  )
  await user.click(screen.getByRole('button', { name: 'Next page' }))
  await screen.findByRole('row', { name: /Gamma Hits/ })
  expect(screen.getByText('1 selected (1 outside this page)')).toBeVisible()

  await user.click(
    screen.getByRole('checkbox', { name: 'Select all Packs on this page' }),
  )
  expect(screen.getByText('2 selected (1 outside this page)')).toBeVisible()

  await user.click(screen.getByRole('button', { name: 'Previous page' }))
  expect(
    await screen.findByRole('checkbox', { name: 'Select Pack Alpha Breaks' }),
  ).toBeChecked()
  expect(screen.getByText('2 selected (1 outside this page)')).toBeVisible()
  expect(screen.getByRole('row', { name: /Alpha Breaks/ })).toHaveAttribute(
    'aria-selected',
    'false',
  )
})

test('selects every Pack on the current page and clears the selection', async () => {
  const user = userEvent.setup()
  const { list } = setup()
  list.mockResolvedValue(pageResult([alpha, beta]))
  renderInRouter(<PackList />)

  await user.click(
    await screen.findByRole('checkbox', {
      name: 'Select all Packs on this page',
    }),
  )
  const checks = screen.getAllByRole('checkbox', { name: /^Select Pack / })
  expect(checks).toHaveLength(2)
  for (const check of checks) {
    expect(check).toBeChecked()
  }
  expect(screen.getByText('2 selected')).toBeVisible()

  await user.click(screen.getByRole('button', { name: 'Clear selection' }))
  for (const check of screen.getAllByRole('checkbox', {
    name: /^Select Pack /,
  })) {
    expect(check).not.toBeChecked()
  }
  expect(screen.queryByText('2 selected')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Clear selection' }),
  ).not.toBeInTheDocument()
})

test('keeps the inspected row independent of the checked Packs', async () => {
  const user = userEvent.setup()
  const { list } = setup()
  list.mockResolvedValue(pageResult([alpha, beta]))
  renderInRouter(<PackList />)

  const alphaRow = await screen.findByRole('row', { name: /Alpha Breaks/ })
  const betaRow = screen.getByRole('row', { name: /Beta Textures/ })
  await user.click(alphaRow)
  expect(alphaRow).toHaveAttribute('aria-selected', 'true')
  expect(betaRow).toHaveAttribute('aria-selected', 'false')

  await user.click(
    screen.getByRole('checkbox', { name: 'Select Pack Beta Textures' }),
  )
  expect(
    screen.getByRole('checkbox', { name: 'Select Pack Beta Textures' }),
  ).toBeChecked()
  expect(alphaRow).toHaveAttribute('aria-selected', 'true')
  expect(betaRow).toHaveAttribute('aria-selected', 'false')
  expect(screen.getByText('1 selected')).toBeVisible()

  alphaRow.focus()
  await user.keyboard('{ArrowDown}')
  expect(betaRow).toHaveAttribute('aria-selected', 'true')
  expect(alphaRow).toHaveAttribute('aria-selected', 'false')
  expect(
    within(betaRow).getByRole('checkbox', {
      name: 'Select Pack Beta Textures',
    }),
  ).toBeChecked()
  expect(screen.getByText('1 selected')).toBeVisible()
})

test('distinguishes two Packs that share a name by their source folder', async () => {
  const { list } = setup()
  const local = makePack({ sourceRootPath: '/music/packs/drums' })
  const archived = makePack({
    id: BETA_ID,
    sourceRootId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    sourceRootPath: '/archive/packs/drums',
  })
  list.mockResolvedValue(pageResult([local, archived]))
  renderInRouter(<PackList />)

  const rows = await screen.findAllByRole('row', { name: /Alpha Breaks/ })
  expect(rows).toHaveLength(2)
  expect(within(rows[0]).getByText('/music/packs/drums')).toBeVisible()
  expect(within(rows[1]).getByText('/archive/packs/drums')).toBeVisible()
  // The row name carries the folder too, so assistive technology can tell the
  // two same-named Packs apart.
  expect(
    screen.getByRole('row', { name: /Alpha Breaks.*\/music\/packs\/drums/ }),
  ).toBe(rows[0])
  expect(
    screen.getByRole('row', { name: /Alpha Breaks.*\/archive\/packs\/drums/ }),
  ).toBe(rows[1])
})

test('shows the empty state when no Packs exist', async () => {
  const { list } = setup()
  list.mockResolvedValue(pageResult([], { total: 0 }))
  renderInRouter(<PackList />)

  expect(await screen.findByText(/No Packs yet\./)).toBeVisible()
  expect(screen.getByText('0 Packs')).toBeVisible()
  expect(screen.queryByRole('grid')).not.toBeInTheDocument()
  expect(list).toHaveBeenCalledExactlyOnceWith({ offset: 0 })
})

test('reports a load failure and retries the requested page', async () => {
  const user = userEvent.setup()
  const { list } = setup()
  list.mockRejectedValueOnce(new Error('Unable to read Packs.'))
  list.mockResolvedValue(pageResult([alpha]))
  renderInRouter(<PackList />)

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Unable to read Packs.')
  expect(screen.queryByRole('grid')).not.toBeInTheDocument()

  await user.click(within(alert).getByRole('button', { name: 'Retry' }))
  expect(await screen.findByRole('row', { name: /Alpha Breaks/ })).toBeVisible()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(list.mock.calls).toEqual([[{ offset: 0 }], [{ offset: 0 }]])
})

test('browsing, inspecting and clearing Packs calls nothing but packs.list', async () => {
  const user = userEvent.setup()
  const { api, list } = setup()
  list.mockResolvedValue(pageResult([alpha, beta]))
  renderInRouter(<PackList />)

  await user.click(await screen.findByRole('row', { name: /Alpha Breaks/ }))
  await user.click(
    screen.getByRole('checkbox', { name: 'Select Pack Beta Textures' }),
  )
  await user.click(screen.getByRole('button', { name: 'Clear selection' }))

  expect(
    screen.queryByRole('button', { name: /delete|remove/i }),
  ).not.toBeInTheDocument()
  for (const [name, group] of Object.entries(api)) {
    if (name === 'packs') {
      continue
    }
    for (const method of Object.values(group)) {
      expect(method).not.toHaveBeenCalled()
    }
  }
})

test('recovers when the requested page no longer holds any Pack', async () => {
  const user = userEvent.setup()
  const { list } = setup()
  // Two Packs disappear between the two page loads.
  let total = 4
  list.mockImplementation(async (request) => {
    const offset = request?.offset ?? 0
    if (offset === 2) {
      total = 2
      return pageResult([], { total, limit: 2, offset: 2 })
    }
    return pageResult([alpha, beta], { total, limit: 2 })
  })
  renderInRouter(<PackList />)

  await screen.findByRole('row', { name: /Alpha Breaks/ })
  await user.click(screen.getByRole('button', { name: 'Next page' }))

  expect(await screen.findByText('1–2 of 2')).toBeVisible()
  expect(screen.getByRole('row', { name: /Alpha Breaks/ })).toBeVisible()
  expect(list.mock.calls).toEqual([
    [{ offset: 0 }],
    [{ offset: 2 }],
    [{ offset: 0 }],
  ])
})
