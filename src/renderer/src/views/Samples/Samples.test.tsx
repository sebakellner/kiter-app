import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { cleanup, render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { Samples } from './Samples'
import {
  defaultContext,
  useNavigationStore,
} from '@renderer/stores/useNavigationStore'
import type { CatalogViewContext } from '@renderer/routes/navigationContext'

vi.mock('@renderer/features/library/components/CatalogList', () => ({
  CatalogList: () => <p>Samples list</p>,
}))
vi.mock('@renderer/features/library/hooks/useLibrarySession', () => ({
  useLibrarySession: () => ({ dir: null, loading: false, error: null }),
}))

const sampleId = '3f9c1b2a-4d5e-4f60-8a71-2b3c4d5e6f70'

beforeEach(() => {
  // The navigation store is module state; a consumed intent must not leak.
  useNavigationStore.setState({
    entries: {},
    destinations: {},
    consumedLocateEntries: {},
  })
})

function renderSamples(
  state?: unknown,
  key = 'locate-entry',
): ReturnType<typeof vi.fn> {
  const update = vi.fn()
  const router = createMemoryRouter(
    [
      {
        path: '/samples',
        element: (
          <Outlet
            context={
              {
                context: defaultContext,
                update,
                onReady: () => {},
              } satisfies CatalogViewContext
            }
          />
        ),
        children: [{ index: true, element: <Samples /> }],
      },
    ],
    {
      initialEntries: [{ pathname: '/samples', state, key }],
    },
  )
  render(<RouterProvider router={router} />)
  return update
}

test('applies a located Genre intent to the view context', () => {
  const genreId = '4e5f6071-8293-4da4-bec5-f60718293a4b'
  const update = renderSamples({
    locateGenreId: genreId,
    locateGenreName: 'House',
  })
  expect(screen.getByRole('heading', { name: 'Samples' })).toBeInTheDocument()
  expect(update).toHaveBeenCalledExactlyOnceWith({
    favoritesOnly: false,
    instruments: [],
    genres: [{ id: genreId, name: 'House' }],
    sampleTypes: [],
    search: '',
    offset: 0,
    scrollTop: 0,
    selectedId: null,
  })
})

test('applies a located Sample intent to the view context', () => {
  const update = renderSamples({
    locateSampleId: sampleId,
    locateSearch: 'Warm Kick',
  })
  expect(screen.getByRole('heading', { name: 'Samples' })).toBeInTheDocument()
  expect(update).toHaveBeenCalledExactlyOnceWith({
    favoritesOnly: false,
    instruments: [],
    genres: [],
    sampleTypes: [],
    search: 'Warm Kick',
    offset: 0,
    scrollTop: 0,
    selectedId: sampleId,
  })
})

test('leaves an ordinary Samples visit untouched', () => {
  const update = renderSamples()
  expect(update).not.toHaveBeenCalled()
})

test('does not re-apply the intent when the same history entry returns', () => {
  const intent = { locateSampleId: sampleId, locateSearch: 'Warm Kick' }
  const first = renderSamples(intent, 'entry-1')
  expect(first).toHaveBeenCalledTimes(1)
  cleanup()

  // Back to that entry restores its router state; it is not a new intent.
  const second = renderSamples(intent, 'entry-1')
  expect(second).not.toHaveBeenCalled()
  cleanup()

  const third = renderSamples(intent, 'entry-2')
  expect(third).toHaveBeenCalledTimes(1)
})
