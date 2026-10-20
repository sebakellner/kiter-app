import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { renderWithToasts as render } from '../../../../../tests/support/ui/renderWithToasts'
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
import { Samples } from '../Samples/Samples'
import { Favorites } from '../Favorites/Favorites'
import { useNavigationContext } from '@renderer/routes/navigationContext'
import { useNavigationStore } from '@renderer/stores/useNavigationStore'
import { createTestApi } from '../../../../../tests/support/ui/bridge'
import { makeCollectionSummary } from '../../../../../tests/support/fixtures/collection'
import { deferred } from '../../../../../tests/support/fixtures/deferred'
import type {
  Collection,
  CollectionRemovalReview,
} from '@shared/domain/collection'
import type { IpcResult } from '@shared/ipc/result'
import { LibrarySessionProvider } from '@renderer/features/library/components/LibrarySessionProvider'
import { SampleInspectorProvider } from '@renderer/features/library/components/SampleInspector'
import { makeAudioSample } from '../../../../../tests/support/fixtures/audio-sample'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
})

const onReady = (): void => {}

test('catalog releases its header sizing observer when leaving the view', async () => {
  const { router } = setup()
  await screen.findByText(/No Collections yet/)
  const observe = vi.fn()
  const disconnect = vi.fn()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = observe
      disconnect = disconnect
    },
  )
  await act(async () => {
    await router.navigate('/samples')
  })
  expect(observe).toHaveBeenCalledExactlyOnceWith(expect.any(HTMLElement))
  await act(async () => {
    await router.navigate('/home')
  })
  expect(disconnect).toHaveBeenCalledOnce()
})

test.each(['samples', 'favorites', 'collection'] as const)(
  '%s adds checked Samples from different pages and hidden results, not the inspected row',
  async (destination) => {
    const { api, router, user } = setup()
    await screen.findByText(/No Collections yet/)
    const collection = makeCollectionSummary({ sampleCount: 51 })
    const other = makeCollectionSummary({
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Destination',
    })
    const samples = ['a.wav', 'z.wav', 'inspected.wav'].map((name, index) => ({
      ...makeAudioSample({
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        name,
        relativePath: name,
      }),
      audioUrl: null,
      rootPath: '/fixtures',
      sourceRevision: 1,
      unavailableReason: 'Audio unavailable.',
    }))
    api.library.onDragError.mockReturnValue(vi.fn())
    api.collections.get.mockResolvedValue({ ok: true, data: collection })
    api.collections.destinations.mockResolvedValue({
      ok: true,
      data: {
        items: [{ ...other, assigned: false }],
        total: 1,
        limit: 50,
        offset: 0,
      },
    })
    api.library.list.mockImplementation(async (request) => ({
      ok: true,
      data: {
        items: request?.sampleIds
          ? samples.slice(0, 2)
          : request?.search
            ? []
            : request?.offset
              ? [samples[0]]
              : [samples[1], samples[2]],
        total: request?.sampleIds ? 2 : request?.search ? 0 : 51,
        offset: request?.offset ?? 0,
        limit: request?.limit ?? 50,
        ...(destination === 'collection'
          ? { collectionOrderToken: 'a'.repeat(64) }
          : {}),
      },
    }))
    await act(async () =>
      router.navigate(
        destination === 'collection'
          ? `/collections/${collection.id}`
          : `/${destination}`,
      ),
    )
    await screen.findByRole('row', { name: /z.wav/ })
    expect(
      screen.queryByRole('button', { name: 'Select' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Select z.wav' }))
    await user.click(screen.getByRole('row', { name: /inspected.wav/ }))
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    await user.click(
      await screen.findByRole('checkbox', { name: 'Select a.wav' }),
    )
    await user.type(
      screen.getByRole('searchbox', { name: 'Search samples' }),
      'zz',
    )
    await screen.findByText('2 selected (2 outside this page)')
    await user.click(screen.getByRole('button', { name: 'Add to Collection' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Add to Collection',
    })
    await user.click(
      await within(dialog).findByText('Review selected Samples (2)'),
    )
    const review = within(dialog).getByRole('list', {
      name: 'Selected Samples',
    })
    expect(
      within(review)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining('a.wav'),
      expect.stringContaining('z.wav'),
    ])
    expect(review).not.toHaveTextContent('inspected.wav')
    expect(api.library.list).toHaveBeenLastCalledWith({
      sampleIds: [samples[1].id, samples[0].id],
      limit: 100,
      offset: 0,
      ...(destination === 'collection' ? { collectionId: collection.id } : {}),
    })
    await user.click(
      within(dialog).getByRole('checkbox', { name: new RegExp(other.id) }),
    )
    api.collections.setMembership.mockResolvedValue({
      ok: true,
      data: { assigned: true, changed: true },
    })
    await user.click(
      within(dialog).getByRole('button', { name: 'Add 2 Samples' }),
    )
    expect(
      await within(dialog).findByRole('region', { name: 'Collection results' }),
    ).toHaveTextContent('2 added, 0 already included, 0 failed.')
    expect(
      api.collections.setMembership.mock.calls.map(
        ([request]) => request.sampleId,
      ),
    ).toEqual([samples[0].id, samples[1].id])
  },
)

test('always-visible checkboxes retain checks through filters, clear explicitly and reset after leaving the view', async () => {
  const { api, router, user } = setup()
  await screen.findByText(/No Collections yet/)
  const collection = makeCollectionSummary({ sampleCount: 1 })
  const sample = {
    ...makeAudioSample(),
    audioUrl: null,
    rootPath: '/fixtures',
    sourceRevision: 1,
    unavailableReason: 'Audio unavailable.',
  }
  api.library.onDragError.mockReturnValue(vi.fn())
  api.collections.get.mockResolvedValue({ ok: true, data: collection })
  api.library.list.mockImplementation(async (request) => ({
    ok: true,
    data: {
      items: request?.search || request?.favoritesOnly ? [] : [sample],
      total: request?.search || request?.favoritesOnly ? 0 : 1,
      limit: 50,
      offset: 0,
      collectionOrderToken: 'a'.repeat(64),
    },
  }))
  await act(async () => {
    await router.navigate(`/collections/${collection.id}`)
  })
  await screen.findByRole('row', { name: /kick.wav/ })
  expect(
    screen.getByRole('checkbox', { name: 'Select kick.wav' }),
  ).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Select' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Add to Collection' }),
  ).not.toBeInTheDocument()
  await user.click(screen.getByRole('checkbox', { name: 'Select kick.wav' }))
  expect(screen.getByText('1 selected')).toBeVisible()
  expect(screen.getByRole('row', { name: /kick.wav/ })).toHaveAttribute(
    'aria-selected',
    'false',
  )
  const search = screen.getByRole('searchbox', { name: 'Search samples' })
  await user.type(search, 'zz')
  expect(
    await screen.findByText('1 selected (1 outside this page)'),
  ).toBeVisible()
  await user.clear(search)
  expect(
    await screen.findByRole('checkbox', { name: 'Select kick.wav' }),
  ).toBeChecked()
  await user.click(screen.getByRole('button', { name: 'Clear selection' }))
  expect(
    screen.queryByRole('button', { name: 'Add to Collection' }),
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole('checkbox', { name: 'Select kick.wav' }),
  ).not.toBeChecked()
  await user.click(screen.getByRole('checkbox', { name: 'Select kick.wav' }))
  await act(async () => {
    await router.navigate('/home')
  })
  await act(async () => {
    await router.navigate(-1)
  })
  await screen.findByRole('row', { name: /kick.wav/ })
  expect(
    screen.getByRole('checkbox', { name: 'Select kick.wav' }),
  ).not.toBeChecked()
  expect(
    screen.queryByRole('button', { name: 'Add to Collection' }),
  ).not.toBeInTheDocument()
  await act(async () => {
    await router.navigate('/samples')
  })
  await screen.findByRole('row', { name: /kick.wav/ })
  await user.click(screen.getByRole('checkbox', { name: 'Select kick.wav' }))
  const favorites = screen.getByRole('checkbox', { name: 'Favorites only' })
  await user.click(favorites)
  expect(
    await screen.findByText('1 selected (1 outside this page)'),
  ).toBeVisible()
  await user.click(favorites)
  expect(
    await screen.findByRole('checkbox', { name: 'Select kick.wav' }),
  ).toBeChecked()
})

test.each(['success', 'failure'] as const)(
  'pending Collection deletion waits for native quit and handles %s without replaying the request',
  async (outcome) => {
    const { api, router, user } = setup()
    await screen.findByText(/No Collections yet/)
    const close = vi.spyOn(window, 'close').mockImplementation(() => {})
    const collection = makeCollectionSummary()
    api.collections.get.mockResolvedValue({ ok: true, data: collection })
    api.collections.reviewRemoval.mockResolvedValue({
      ok: true,
      data: { entity: collection, sampleCount: 0, token: 'a'.repeat(64) },
    })
    await act(async () => {
      await router.navigate(`/collections/${collection.id}`)
    })
    await user.click(
      await screen.findByRole('button', { name: 'Delete Collection' }),
    )
    const dialog = screen.getByRole('alertdialog')
    const pending = deferred<IpcResult<{ id: string }>>()
    api.collections.remove.mockReturnValueOnce(pending.promise)
    await user.click(
      await within(dialog).findByRole('button', { name: 'Delete Collection' }),
    )
    const exit = new Event('beforeunload', { cancelable: true })
    act(() => {
      window.dispatchEvent(exit)
    })
    expect(exit.defaultPrevented).toBe(true)
    expect(close).not.toHaveBeenCalled()
    await act(async () => {
      await router.navigate('/home')
    })
    expect(router.state.location.pathname).toBe(`/collections/${collection.id}`)
    await act(async () =>
      pending.resolve(
        outcome === 'success'
          ? { ok: true, data: { id: collection.id } }
          : {
              ok: false,
              error: {
                code: 'STORAGE_FAILED',
                message: 'Unable to verify deletion. Review again.',
              },
            },
      ),
    )
    expect(api.collections.remove).toHaveBeenCalledTimes(1)
    if (outcome === 'success') {
      expect(close).toHaveBeenCalledOnce()
    } else {
      expect(close).not.toHaveBeenCalled()
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Review again.',
      )
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      await act(async () => {
        await router.navigate('/home')
      })
      expect(
        await screen.findByRole('heading', { name: 'Home' }),
      ).toBeInTheDocument()
    }
  },
)

test('Collection deletion requires a successful fresh review and ignores results after leaving its detail', async () => {
  const { api, router, user } = setup()
  await screen.findByText(/No Collections yet/)
  const collection = makeCollectionSummary()
  api.collections.get.mockResolvedValue({ ok: true, data: collection })
  api.collections.reviewRemoval.mockResolvedValueOnce({
    ok: false,
    error: {
      code: 'STORAGE_FAILED',
      message: 'Unable to review the Collection.',
    },
  })
  await act(async () => {
    await router.navigate(`/collections/${collection.id}`)
  })
  await user.click(
    await screen.findByRole('button', { name: 'Delete Collection' }),
  )
  const dialog = screen.getByRole('alertdialog')
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'Unable to review',
  )
  expect(api.collections.remove).not.toHaveBeenCalled()
  const pending = deferred<IpcResult<CollectionRemovalReview>>()
  api.collections.reviewRemoval.mockReturnValueOnce(pending.promise)
  await user.click(within(dialog).getByRole('button', { name: 'Review again' }))
  expect(
    within(dialog).getByRole('button', { name: 'Review again' }),
  ).toBeDisabled()
  await act(async () => {
    await router.navigate('/home')
  })
  await act(async () =>
    pending.resolve({
      ok: true,
      data: { entity: collection, sampleCount: 0, token: 'a'.repeat(64) },
    }),
  )
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument()
  expect(api.collections.remove).not.toHaveBeenCalled()
})

test('Collection editing preserves failed drafts, reloads saved values for comparison and saves with the refreshed baseline', async () => {
  const { api, router, user } = setup()
  await screen.findByText(/No Collections yet/)
  const collection = makeCollectionSummary({
    description: 'Original description',
  })
  api.collections.get.mockResolvedValue({ ok: true, data: collection })
  await act(async () => {
    await router.navigate(`/collections/${collection.id}`)
  })
  await user.click(
    await screen.findByRole('button', { name: 'Edit Collection' }),
  )
  const dialog = screen.getByRole('dialog', { name: 'Edit Collection' })
  const name = within(dialog).getByRole('textbox', { name: 'Name' })
  expect(name).toHaveValue(collection.name)
  await user.clear(name)
  await user.type(name, 'My new name')
  api.collections.update.mockResolvedValueOnce({
    ok: false,
    error: {
      code: 'STALE_REVIEW',
      message: 'The Collection changed. Reload saved details.',
    },
  })
  await user.click(within(dialog).getByRole('button', { name: 'Save' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'The Collection changed.',
  )
  expect(name).toHaveValue('My new name')
  expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
  const newer = { ...collection, name: 'Another saved name' }
  api.collections.get.mockResolvedValue({ ok: true, data: newer })
  await user.click(
    within(dialog).getByRole('button', { name: 'Reload saved details' }),
  )
  expect(name).toHaveValue('My new name')
  expect(within(dialog).getByText(newer.name)).toBeInTheDocument()
  const pending = deferred<IpcResult<Collection>>()
  api.collections.update.mockReturnValueOnce(pending.promise)
  await user.click(within(dialog).getByRole('button', { name: 'Save' }))
  expect(name).toBeDisabled()
  await user.keyboard('{Escape}')
  expect(dialog).toBeVisible()
  expect(api.collections.update).toHaveBeenLastCalledWith({
    id: collection.id,
    name: 'My new name',
    description: 'Original description',
    expected: { name: newer.name, description: newer.description },
  })
  const saved = { ...newer, name: 'My new name' }
  api.collections.get.mockResolvedValue({ ok: true, data: saved })
  await act(async () => pending.resolve({ ok: true, data: saved }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(
    await screen.findByRole('heading', { name: saved.name, level: 1 }),
  ).toBeInTheDocument()
  expect(api.library.setFavorite).not.toHaveBeenCalled()
})

test('Collection edit navigation offers Save, Discard or Stay and never deletes a dirty draft', async () => {
  const { api, router, user } = setup()
  await screen.findByText(/No Collections yet/)
  const collection = makeCollectionSummary()
  api.collections.get.mockResolvedValue({ ok: true, data: collection })
  await act(async () => {
    await router.navigate(`/collections/${collection.id}`)
  })
  await user.click(
    await screen.findByRole('button', { name: 'Edit Collection' }),
  )
  const dialog = screen.getByRole('dialog')
  await user.type(
    within(dialog).getByRole('textbox', { name: 'Name' }),
    ' edited',
  )
  await act(async () => {
    await router.navigate('/home')
  })
  expect(router.state.location.pathname).toBe(`/collections/${collection.id}`)
  await user.click(within(dialog).getByRole('button', { name: 'Stay' }))
  await user.keyboard('{Escape}')
  expect(
    within(dialog).getByRole('button', { name: 'Save and close' }),
  ).toBeVisible()
  await user.click(
    within(dialog).getByRole('button', { name: 'Discard changes' }),
  )
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(api.collections.update).not.toHaveBeenCalled()
  expect(api.collections.reviewRemoval).not.toHaveBeenCalled()
})

test('Collection deletion cancels safely, discards stale reviews and requires a fresh confirmation before navigating to the list', async () => {
  const { api, router, user } = setup()
  await screen.findByText(/No Collections yet/)
  const collection = makeCollectionSummary({ sampleCount: 1 })
  api.collections.get.mockResolvedValue({ ok: true, data: collection })
  const review = { entity: collection, sampleCount: 1, token: 'a'.repeat(64) }
  api.collections.reviewRemoval.mockResolvedValue({ ok: true, data: review })
  await act(async () => {
    await router.navigate(`/collections/${collection.id}`)
  })
  const opener = await screen.findByRole('button', {
    name: 'Delete Collection',
  })
  await user.click(opener)
  let dialog = screen.getByRole('alertdialog', { name: 'Delete Collection?' })
  expect(
    await within(dialog).findByText(/Original|original audio files are kept/),
  ).toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(api.collections.remove).not.toHaveBeenCalled()
  expect(opener).toHaveFocus()
  await user.click(opener)
  dialog = screen.getByRole('alertdialog')
  await waitFor(() =>
    expect(
      within(dialog).getByRole('button', { name: 'Delete Collection' }),
    ).toBeEnabled(),
  )
  api.collections.remove.mockResolvedValueOnce({
    ok: false,
    error: {
      code: 'STALE_REVIEW',
      message: 'The Collection changed. Review it again before removing.',
    },
  })
  await user.click(
    within(dialog).getByRole('button', { name: 'Delete Collection' }),
  )
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'Review it again',
  )
  expect(
    within(dialog).queryByRole('button', { name: 'Delete Collection' }),
  ).not.toBeInTheDocument()
  const fresh = { ...review, sampleCount: 2, token: 'b'.repeat(64) }
  api.collections.reviewRemoval.mockResolvedValueOnce({ ok: true, data: fresh })
  await user.click(within(dialog).getByRole('button', { name: 'Review again' }))
  expect(
    await within(dialog).findByText(/2 Sample references/),
  ).toBeInTheDocument()
  expect(api.collections.remove).toHaveBeenCalledTimes(1)
  const pending = deferred<IpcResult<{ id: string }>>()
  api.collections.remove.mockReturnValueOnce(pending.promise)
  await user.click(
    within(dialog).getByRole('button', { name: 'Delete Collection' }),
  )
  await user.keyboard('{Escape}')
  expect(dialog).toBeVisible()
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
  expect(api.collections.remove).toHaveBeenLastCalledWith({
    id: collection.id,
    token: fresh.token,
  })
  await act(async () => {
    await router.navigate('/home')
  })
  expect(router.state.location.pathname).toBe(`/collections/${collection.id}`)
  await act(async () =>
    pending.resolve({ ok: true, data: { id: collection.id } }),
  )
  await waitFor(() =>
    expect(router.state.location.pathname).toBe('/collections'),
  )
  expect(screen.getByText(/Collection deleted\. Samples/)).toBeInTheDocument()
  expect(api.library.setFavorite).not.toHaveBeenCalled()
})

function Layout(): React.JSX.Element {
  const { context, update } = useNavigationContext()
  return (
    <LibrarySessionProvider>
      <SampleInspectorProvider
        open={context.inspectorOpen}
        setOpen={(inspectorOpen) => update({ inspectorOpen })}
      >
        <Link to="/home">Home</Link>
        <Outlet context={{ context, update, onReady }} />
      </SampleInspectorProvider>
    </LibrarySessionProvider>
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
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
    },
  )
  api.library.list.mockResolvedValue({
    ok: true,
    data: { items: [], total: 0, limit: 50, offset: 0 },
  })
  api.instruments.list.mockResolvedValue({
    ok: true,
    data: { items: [], total: 0, limit: 50, offset: 0 },
  })
  api.genres.list.mockResolvedValue({
    ok: true,
    data: { items: [], total: 0, limit: 50, offset: 0 },
  })
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
          { path: '/samples', element: <Samples /> },
          { path: '/favorites', element: <Favorites /> },
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
  expect(
    await screen.findByText(/This Collection is empty/),
  ).toBeInTheDocument()
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
  api.library.list.mockResolvedValue({
    ok: true,
    data: {
      items: [0, 1].map((index) => ({
        ...makeAudioSample({
          id: `00000000-0000-4000-8000-00000000000${index + 1}`,
        }),
        rootPath: '/fixtures',
        sourceRevision: 1,
        audioUrl: null,
        unavailableReason: 'Audio unavailable.',
      })),
      total: 2,
      limit: 50,
      offset: 0,
    },
  })
  await user.click(
    within(row).getByRole('link', { name: 'Open Session Picks' }),
  )
  await screen.findByRole('heading', { name: collection.name, level: 1 })
  await waitFor(() =>
    expect(
      within(screen.getByRole('rowgroup', { name: 'Samples' })).getAllByRole(
        'row',
      ),
    ).toHaveLength(2),
  )
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

test('Collection search and type filters disable ordering even when every member still matches', async () => {
  const { api, router, user } = setup()
  await screen.findByText(/No Collections yet/)
  const collection = makeCollectionSummary({ sampleCount: 1 })
  const sample = {
    ...makeAudioSample(),
    audioUrl: null,
    rootPath: '/fixtures',
    sourceRevision: 1,
    unavailableReason: 'Audio unavailable.',
  }
  api.library.onDragError.mockReturnValue(vi.fn())
  api.collections.get.mockResolvedValue({ ok: true, data: collection })
  api.library.list.mockResolvedValue({
    ok: true,
    data: {
      items: [sample],
      total: 1,
      limit: 50,
      offset: 0,
      collectionOrderToken: 'a'.repeat(64),
    },
  })
  await act(async () => {
    await router.navigate(`/collections/${collection.id}`)
  })
  const handle = await screen.findByRole('button', { name: 'Reorder kick.wav' })
  // Missing audio does not prevent organizing its catalog reference.
  expect(handle).toBeEnabled()
  await user.type(
    screen.getByRole('searchbox', { name: 'Search samples' }),
    'k',
  )
  expect(handle).toBeDisabled()
  expect(
    screen.queryByRole('region', { name: 'Collection order' }),
  ).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Clear search' }))
  await waitFor(() => expect(handle).toBeEnabled())
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Sample type' }),
    'unknown',
  )
  expect(handle).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Clear all' }))
  await waitFor(() => expect(handle).toBeEnabled())
  expect(api.collections.moveSample).not.toHaveBeenCalled()
  expect(api.collections.placeSample).not.toHaveBeenCalled()
})

test('keyboard ordering follows the moved member across pages and a stale move refreshes without replay', async () => {
  const { api, router, user } = setup()
  await screen.findByText(/No Collections yet/)
  const collection = makeCollectionSummary({ sampleCount: 52 })
  const samples = Array.from({ length: 52 }, (_, index) => ({
    ...makeAudioSample({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      name: `sample-${index}.wav`,
      relativePath: `sample-${index}.wav`,
    }),
    audioUrl: null,
    rootPath: '/fixtures',
    sourceRevision: 1,
    unavailableReason: 'Audio unavailable.',
  }))
  let token = 'a'.repeat(64)
  api.library.onDragError.mockReturnValue(vi.fn())
  api.collections.get.mockResolvedValue({ ok: true, data: collection })
  api.library.list.mockImplementation(async (request) => {
    const offset = request?.offset ?? 0
    return {
      ok: true,
      data: {
        items: samples.slice(offset, offset + 50),
        total: 52,
        limit: 50,
        offset,
        collectionOrderToken: token,
      },
    }
  })
  api.collections.moveSample.mockImplementationOnce(async () => {
    const previous = samples[49]
    samples[49] = samples[50]
    samples[50] = previous
    token = 'b'.repeat(64)
    return {
      ok: true,
      data: {
        collectionId: collection.id,
        sampleId: samples[50].id,
        changed: true,
        index: 50,
        orderToken: token,
      },
    }
  })
  await act(async () => {
    await router.navigate(`/collections/${collection.id}`)
  })
  const moving = await screen.findByRole('row', { name: /sample-49.wav/ })
  moving.focus()
  await user.keyboard('{Shift>}{F10}{/Shift}')
  await user.click(screen.getByRole('menuitem', { name: 'Move down' }))
  await waitFor(() =>
    expect(
      within(screen.getByRole('rowgroup', { name: 'Samples' })).getAllByRole(
        'row',
      ),
    ).toHaveLength(2),
  )
  const moved = within(
    screen.getByRole('rowgroup', { name: 'Samples' }),
  ).getAllByRole('row')[0]
  expect(moved).toHaveTextContent('sample-49.wav')
  expect(moved).toHaveAttribute('aria-selected', 'true')
  await waitFor(() => expect(moved).toHaveFocus())
  expect(api.collections.moveSample).toHaveBeenCalledExactlyOnceWith({
    collectionId: collection.id,
    sampleId: samples[50].id,
    direction: 'down',
    token: 'a'.repeat(64),
  })

  api.collections.moveSample.mockResolvedValueOnce({
    ok: false,
    error: { code: 'STALE_REVIEW', message: 'The Collection order changed.' },
  })
  token = 'c'.repeat(64)
  await user.keyboard('{Shift>}{F10}{/Shift}')
  await user.click(screen.getByRole('menuitem', { name: 'Move up' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The Collection order changed.',
  )
  await waitFor(() =>
    expect(api.library.list).toHaveBeenLastCalledWith({
      collectionId: collection.id,
      favoritesOnly: false,
      offset: 50,
    }),
  )
  expect(api.collections.moveSample).toHaveBeenCalledTimes(2)
  const first = within(
    screen.getByRole('rowgroup', { name: 'Samples' }),
  ).getAllByRole('row')[0]
  expect(first).toHaveTextContent('sample-49.wav')
  expect(first).toHaveAttribute('aria-selected', 'true')
})
