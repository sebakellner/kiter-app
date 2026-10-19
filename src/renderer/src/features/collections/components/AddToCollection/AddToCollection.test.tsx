import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom'
import type {
  CollectionDestination,
  CollectionPage,
  CollectionMembershipResult,
} from '@shared/domain/collection'
import type { IpcResult } from '@shared/ipc/result'
import { createTestApi } from '../../../../../../../tests/support/ui/bridge'
import { makeCollectionSummary } from '../../../../../../../tests/support/fixtures/collection'
import { deferred } from '../../../../../../../tests/support/fixtures/deferred'
import { AddToCollection } from './AddToCollection'

const sample = { id: '00000000-0000-4000-8000-000000000001', name: 'kick.wav' }
const first = { ...makeCollectionSummary(), assigned: true }
const second = {
  ...makeCollectionSummary({ id: '22222222-2222-4222-8222-222222222222' }),
  assigned: false,
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
})

function setup(total = 2): {
  api: ReturnType<typeof createTestApi>
  router: ReturnType<typeof createMemoryRouter>
  onClose: ReturnType<typeof vi.fn>
  user: ReturnType<typeof userEvent.setup>
} {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement): void {
      this.setAttribute('open', '')
    },
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement): void {
      this.removeAttribute('open')
    },
  })
  const api = createTestApi()
  vi.stubGlobal('api', api)
  api.collections.destinations.mockResolvedValue({
    ok: true,
    data: { items: [first, second], total, offset: 0, limit: 50 },
  })
  const onClose = vi.fn()
  const router = createMemoryRouter(
    [
      {
        path: '/samples',
        element: (
          <>
            <Link to="/home">Home</Link>
            <AddToCollection sample={sample} onClose={onClose} />
          </>
        ),
      },
      { path: '/home', element: <h1>Home</h1> },
    ],
    { initialEntries: ['/samples'] },
  )
  render(<RouterProvider router={router} />)
  return { api, router, onClose, user: userEvent.setup() }
}

test('multi-destination additions distinguish existing members, retain partial results and retry only failed identities', async () => {
  const { api, user, router, onClose } = setup()
  await user.click(
    await screen.findByRole('checkbox', { name: new RegExp(first.id) }),
  )
  await user.click(
    screen.getByRole('checkbox', { name: new RegExp(second.id) }),
  )
  api.collections.setMembership
    .mockResolvedValueOnce({
      ok: true,
      data: { assigned: true, changed: false },
    })
    .mockResolvedValueOnce({
      ok: false,
      error: { code: 'STORAGE_FAILED', message: 'Second destination failed.' },
    })
  await user.click(screen.getByRole('button', { name: 'Add Sample' }))
  const results = await screen.findByRole('region', {
    name: 'Collection results',
  })
  expect(results).toHaveTextContent('0 added, 1 already included, 1 failed.')
  expect(results).toHaveTextContent('Second destination failed.')
  expect(
    api.collections.setMembership.mock.calls.map(
      ([request]) => request.collectionId,
    ),
  ).toEqual([first.id, second.id])
  const pending = deferred<IpcResult<CollectionMembershipResult>>()
  api.collections.setMembership.mockReturnValueOnce(pending.promise)
  await user.click(screen.getByRole('button', { name: 'Retry failed' }))
  expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled()
  await user.keyboard('{Escape}')
  expect(onClose).not.toHaveBeenCalled()
  await user.click(screen.getByRole('link', { name: 'Home' }))
  expect(router.state.location.pathname).toBe('/samples')
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  const close = vi.spyOn(window, 'close').mockImplementation(() => {})
  act(() => api.lifecycle.onCloseRequested.mock.calls.at(-1)![0]())
  await act(async () =>
    pending.resolve({ ok: true, data: { assigned: true, changed: true } }),
  )
  expect(close).toHaveBeenCalledOnce()
  expect(results).toHaveTextContent('1 added, 1 already included, 0 failed.')
  expect(
    api.collections.setMembership.mock.calls.map(([request]) => request),
  ).toEqual([
    { collectionId: first.id, sampleId: sample.id, assigned: true },
    { collectionId: second.id, sampleId: sample.id, assigned: true },
    { collectionId: second.id, sampleId: sample.id, assigned: true },
  ])
})

test('destination selection survives pages, stale searches and read failures without changing source identity', async () => {
  const { api, user } = setup(51)
  await user.click(
    await screen.findByRole('checkbox', { name: new RegExp(first.id) }),
  )
  api.collections.destinations.mockResolvedValueOnce({
    ok: true,
    data: { items: [second], total: 51, limit: 50, offset: 50 },
  })
  api.collections.destinations.mockResolvedValueOnce({
    ok: true,
    data: { items: [first], total: 51, limit: 50, offset: 0 },
  })
  const search = screen.getByRole('searchbox', { name: 'Search Collections' })
  await user.click(screen.getByRole('button', { name: 'Next Collections' }))
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Previous Collections' }),
    ).toBeEnabled(),
  )
  await user.click(
    await screen.findByRole('checkbox', { name: new RegExp(second.id) }),
  )
  await user.click(screen.getByRole('button', { name: 'Previous Collections' }))
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Previous Collections' }),
    ).toBeDisabled(),
  )
  const stale = deferred<IpcResult<CollectionPage<CollectionDestination>>>()
  api.collections.destinations
    .mockReturnValueOnce(stale.promise)
    .mockResolvedValueOnce({
      ok: true,
      data: { items: [], total: 0, limit: 50, offset: 0 },
    })
  await user.type(search, 'xy')
  expect(
    await screen.findByText('No Collections match this search.'),
  ).toBeVisible()
  await act(async () =>
    stale.resolve({
      ok: true,
      data: { items: [first], total: 1, offset: 0, limit: 50 },
    }),
  )
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  api.collections.destinations.mockResolvedValueOnce({
    ok: false,
    error: { code: 'STORAGE_FAILED', message: 'Destinations unavailable.' },
  })
  await user.type(search, 'z')
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Destinations unavailable.',
  )
  expect(
    within(
      screen.getByRole('list', { name: 'Selected Collections' }),
    ).getAllByRole('button'),
  ).toHaveLength(2)
  api.collections.destinations.mockResolvedValueOnce({
    ok: true,
    data: { items: [], total: 0, offset: 0, limit: 50 },
  })
  await user.click(screen.getByRole('button', { name: 'Retry Collections' }))
  await screen.findByText('No Collections match this search.')
  expect(search).toHaveValue('xyz')
  api.collections.setMembership.mockResolvedValue({
    ok: true,
    data: { assigned: true, changed: true },
  })
  await user.click(screen.getByRole('button', { name: 'Add Sample' }))
  expect(
    await screen.findByRole('region', { name: 'Collection results' }),
  ).toHaveTextContent('2 added')
  expect(
    api.collections.setMembership.mock.calls.map(
      ([request]) => request.collectionId,
    ),
  ).toEqual([first.id, second.id])
})

test('creation returns to the picker selected, preserves prior choices and does not add until confirmed', async () => {
  const { api, user, router, onClose } = setup()
  await user.click(
    await screen.findByRole('checkbox', { name: new RegExp(first.id) }),
  )
  await user.click(screen.getByRole('button', { name: 'Create Collection' }))
  const creator = screen.getByRole('dialog', { name: 'Create Collection' })
  await user.type(
    within(creator).getByRole('textbox', { name: 'Name' }),
    'New picks',
  )
  api.collections.create.mockResolvedValueOnce({
    ok: true,
    data: { ...second, name: 'New picks' },
  })
  await user.click(within(creator).getByRole('button', { name: 'Create' }))
  await screen.findByRole('dialog', { name: 'Add to Collection' })
  const selected = screen.getByRole('list', { name: 'Selected Collections' })
  expect(selected).toHaveTextContent(first.name)
  expect(selected).toHaveTextContent('New picks')
  expect(api.collections.setMembership).not.toHaveBeenCalled()
  expect(router.state.location.pathname).toBe('/samples')
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onClose).toHaveBeenCalledOnce()
  expect(api.collections.create).toHaveBeenCalledOnce()
})

test('deleted destinations require choosing again rather than silently substituting a matching name', async () => {
  const { api, user } = setup()
  await user.click(
    await screen.findByRole('checkbox', { name: new RegExp(first.id) }),
  )
  api.collections.setMembership.mockResolvedValueOnce({
    ok: false,
    error: { code: 'NOT_FOUND', message: 'The Collection no longer exists.' },
  })
  await user.click(screen.getByRole('button', { name: 'Add Sample' }))
  expect(
    await screen.findByRole('region', { name: 'Collection results' }),
  ).toHaveTextContent('1 failed')
  expect(
    screen.queryByRole('button', { name: 'Retry failed' }),
  ).not.toBeInTheDocument()
  await user.click(
    screen.getByRole('button', { name: 'Choose destinations again' }),
  )
  expect(
    await screen.findByRole('checkbox', { name: new RegExp(first.id) }),
  ).not.toBeChecked()
  expect(api.collections.setMembership).toHaveBeenCalledTimes(1)
})
