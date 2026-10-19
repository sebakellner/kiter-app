import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import {
  createMemoryRouter,
  Link,
  Outlet,
  RouterProvider,
} from 'react-router-dom'
import { Collections } from './Collections'
import { CollectionDetail } from '../CollectionDetail/CollectionDetail'
import { useNavigationContext } from '@renderer/routes/navigationContext'
import { useNavigationStore } from '@renderer/stores/useNavigationStore'
import { createTestApi } from '../../../../../tests/support/ui/bridge'
import { makeCollectionSummary } from '../../../../../tests/support/fixtures/collection'
import { deferred } from '../../../../../tests/support/fixtures/deferred'
import type { Collection } from '@shared/domain/collection'
import type { IpcResult } from '@shared/ipc/result'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
})

const onReady = (): void => {}

function Layout(): React.JSX.Element {
  const { context, update } = useNavigationContext()
  return (
    <>
      <Link to="/home">Home</Link>
      <Outlet context={{ context, update, onReady }} />
    </>
  )
}

function setup(initialEntry = '/collections'): {
  api: ReturnType<typeof createTestApi>
  router: ReturnType<typeof createMemoryRouter>
  user: ReturnType<typeof userEvent.setup>
} {
  useNavigationStore.setState({ entries: {}, destinations: {} })
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
  api.collections.list.mockResolvedValue({
    ok: true,
    data: { items: [], total: 0, limit: 50, offset: 0 },
  })
  const router = createMemoryRouter(
    [
      {
        element: <Layout />,
        children: [
          { path: '/collections', element: <Collections /> },
          { path: '/collections/:id', element: <CollectionDetail /> },
          { path: '/home', element: <h1>Home</h1> },
        ],
      },
    ],
    { initialEntries: [initialEntry] },
  )
  render(<RouterProvider router={router} />)
  return { api, router, user: userEvent.setup() }
}

test('Collection creation validates, preserves failed drafts, prevents duplicate submissions and opens detail only after success', async () => {
  const { api, router, user } = setup()
  await screen.findByText(/No Collections yet/)
  await user.click(screen.getByRole('button', { name: 'Create Collection' }))
  const dialog = screen.getByRole('dialog', { name: 'Create Collection' })
  await user.click(within(dialog).getByRole('button', { name: 'Create' }))
  expect(api.collections.create).not.toHaveBeenCalled()
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'nonempty name',
  )
  await user.type(
    within(dialog).getByRole('textbox', { name: 'Name' }),
    'Session Picks',
  )
  await user.type(
    within(dialog).getByRole('textbox', { name: 'Description (optional)' }),
    'Quiet textures',
  )
  api.collections.create.mockResolvedValueOnce({
    ok: false,
    error: {
      code: 'STORAGE_FAILED',
      message: 'Unable to save. Retry storage.',
    },
  })
  await user.click(within(dialog).getByRole('button', { name: 'Create' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'Retry storage.',
  )
  expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue(
    'Session Picks',
  )
  const pending = deferred<IpcResult<Collection>>()
  api.collections.create.mockReturnValueOnce(pending.promise)
  const collection = makeCollectionSummary({ description: 'Quiet textures' })
  api.collections.get.mockResolvedValue({ ok: true, data: collection })
  await user.click(within(dialog).getByRole('button', { name: 'Create' }))
  expect(within(dialog).getByRole('button', { name: 'Create' })).toBeDisabled()
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
  expect(router.state.location.pathname).toBe('/collections')
  await act(async () => pending.resolve({ ok: true, data: collection }))
  await screen.findByRole('heading', { name: collection.name, level: 1 })
  expect(router.state.location.pathname).toBe(`/collections/${collection.id}`)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByText(/This Collection is empty/)).toBeInTheDocument()
  expect(api.collections.create).toHaveBeenCalledTimes(2)
})

test('Collection creation protects cancel, restores focus and blocks dirty route changes until discard', async () => {
  const { api, router, user } = setup()
  const opener = screen.getByRole('button', { name: 'Create Collection' })
  await user.click(opener)
  const dialog = screen.getByRole('dialog')
  await user.type(
    within(dialog).getByRole('textbox', { name: 'Name' }),
    'Draft',
  )
  await user.keyboard('{Escape}{Escape}{Escape}')
  expect(within(dialog).getByRole('button', { name: 'Stay' })).toBeVisible()
  expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue(
    'Draft',
  )
  fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }))
  await user.click(within(dialog).getByRole('button', { name: 'Stay' }))
  expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue(
    'Draft',
  )
  const closeRequest = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(closeRequest)
  expect(closeRequest.defaultPrevented).toBe(true)
  await act(async () => {
    await router.navigate('/home')
  })
  expect(router.state.location.pathname).toBe('/collections')
  await user.click(within(dialog).getByRole('button', { name: 'Stay' }))
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  await user.click(
    within(dialog).getByRole('button', { name: 'Discard changes' }),
  )
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(opener).toHaveFocus()
  expect(api.collections.create).not.toHaveBeenCalled()
  await user.click(opener)
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(opener).toHaveFocus()
})

test('Collection creation waits for a pending write before honoring an application exit request', async () => {
  const { api, user } = setup()
  const close = vi.spyOn(window, 'close').mockImplementation(() => {})
  await user.click(screen.getByRole('button', { name: 'Create Collection' }))
  const dialog = screen.getByRole('dialog')
  await user.type(
    within(dialog).getByRole('textbox', { name: 'Name' }),
    'Saved on exit',
  )
  const pending = deferred<IpcResult<Collection>>()
  api.collections.create.mockReturnValueOnce(pending.promise)
  await user.click(within(dialog).getByRole('button', { name: 'Create' }))
  act(() => api.lifecycle.onCloseRequested.mock.calls.at(-1)![0]())
  expect(
    within(dialog).getByRole('button', { name: 'Save and quit' }),
  ).toBeDisabled()
  expect(close).not.toHaveBeenCalled()
  await act(async () =>
    pending.resolve({ ok: true, data: makeCollectionSummary() }),
  )
  expect(close).toHaveBeenCalledOnce()
})

test('Collection list keeps cards on refresh failure and supports selection independently of opening', async () => {
  const { api, router, user } = setup()
  await screen.findByText(/No Collections yet/)
  const collection = makeCollectionSummary({ sampleCount: 2 })
  api.collections.list.mockResolvedValueOnce({
    ok: true,
    data: { items: [collection], total: 1, limit: 50, offset: 0 },
  })
  await user.click(screen.getByRole('button', { name: 'Refresh Collections' }))
  const row = await screen.findByRole('row')
  expect(within(row).getByText('2 Samples')).toBeInTheDocument()
  await user.click(within(row).getByRole('heading'))
  expect(row).toHaveAttribute('aria-selected', 'true')
  expect(router.state.location.pathname).toBe('/collections')
  api.collections.list.mockResolvedValueOnce({
    ok: false,
    error: { code: 'STORAGE_FAILED', message: 'Cannot refresh Collections.' },
  })
  await user.click(screen.getByRole('button', { name: 'Refresh Collections' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Cannot refresh Collections.',
  )
  expect(screen.getByRole('row')).toHaveTextContent(collection.name)
  api.collections.get.mockResolvedValue({ ok: true, data: collection })
  await user.click(
    within(row).getByRole('link', { name: 'Open Session Picks' }),
  )
  await screen.findByRole('heading', { name: collection.name, level: 1 })
  expect(screen.queryByText(/This Collection is empty/)).not.toBeInTheDocument()
})

test('Collection details expose unavailable identities with a recovery link and retry', async () => {
  const { api, router, user } = setup()
  await screen.findByText(/No Collections yet/)
  api.collections.get.mockResolvedValueOnce({
    ok: false,
    error: { code: 'NOT_FOUND', message: 'The Collection no longer exists.' },
  })
  const missing = '22222222-2222-4222-8222-222222222222'
  await act(async () => {
    await router.navigate(`/collections/${missing}`)
  })
  expect(
    await screen.findByRole('heading', { name: 'Collection unavailable' }),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Collections' })).toHaveAttribute(
    'href',
    '/collections',
  )
  api.collections.get.mockResolvedValueOnce({
    ok: true,
    data: makeCollectionSummary({ id: missing }),
  })
  await user.click(screen.getByRole('button', { name: 'Retry' }))
  await waitFor(() =>
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Session Picks',
    ),
  )
})

test('Collection list paginates and restores the selected page after returning from detail', async () => {
  const { api, router, user } = setup()
  await screen.findByText(/No Collections yet/)
  const collections = Array.from({ length: 51 }, (_, index) =>
    makeCollectionSummary({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      name: `Selection ${index}`,
    }),
  )
  api.collections.list.mockImplementation(async (request) => {
    const offset = request?.offset ?? 0
    return {
      ok: true,
      data: {
        items: collections.slice(offset, offset + 50),
        total: 51,
        limit: 50,
        offset,
      },
    }
  })
  await user.click(screen.getByRole('button', { name: 'Refresh Collections' }))
  await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(50))
  await user.click(screen.getByRole('button', { name: 'Next page' }))
  await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(1))
  const row = screen.getByRole('row')
  await user.click(within(row).getByRole('heading', { name: 'Selection 50' }))
  api.collections.get.mockResolvedValueOnce({ ok: true, data: collections[50] })
  await user.click(within(row).getByRole('link', { name: 'Open Selection 50' }))
  await screen.findByRole('heading', { name: 'Selection 50', level: 1 })
  await act(async () => {
    await router.navigate(-1)
  })
  await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(1))
  expect(screen.getByRole('row')).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('row')).toHaveTextContent('Selection 50')
  expect(api.collections.list).toHaveBeenLastCalledWith({ offset: 50 })
  await user.click(screen.getByRole('button', { name: 'Previous page' }))
  await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(50))
  expect(screen.queryByRole('row', { selected: true })).not.toBeInTheDocument()
})
