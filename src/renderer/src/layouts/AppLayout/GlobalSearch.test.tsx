import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { GlobalSearch } from './GlobalSearch'
import { createTestApi } from '../../../../../tests/support/ui/bridge'
import type { CatalogAudioSample, LibraryPage } from '@shared/ipc/library'

beforeEach(() => {
  // The anchored popover observes its anchor and panel.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
    },
  )
})

const kickId = '3f9c1b2a-4d5e-4f60-8a71-2b3c4d5e6f70'
const snareId = '7a1d2e3f-4b5c-4d6e-9f80-1a2b3c4d5e6f'

function sample(id: string, name: string): CatalogAudioSample {
  return {
    id,
    name,
    audioUrl: null,
    unavailableReason: null,
  } as CatalogAudioSample
}

function page(items: CatalogAudioSample[]): LibraryPage {
  return { items, total: items.length, limit: 5, offset: 0 }
}

function LocationProbe(): React.JSX.Element {
  const location = useLocation()
  return (
    <output data-testid="location">
      {`${location.pathname} ${JSON.stringify(location.state)}`}
    </output>
  )
}

function renderSearch(): void {
  render(
    <MemoryRouter initialEntries={['/packs']}>
      <GlobalSearch revision={0} />
      <Routes>
        <Route path="/samples" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

function searchbox(): HTMLElement {
  return screen.getByRole('combobox', { name: 'Search library' })
}

test('does not query one character and advertises the two-character minimum', async () => {
  const api = createTestApi()
  vi.stubGlobal('api', api)
  const user = userEvent.setup()
  renderSearch()
  await user.type(searchbox(), 'k')
  expect(
    screen.getByText('Type at least 2 characters to search.'),
  ).toBeInTheDocument()
  expect(api.library.list).not.toHaveBeenCalled()
})

test('lists Sample name suggestions for a two-character query', async () => {
  const api = createTestApi()
  api.library.list.mockResolvedValue({
    ok: true,
    data: page([sample(kickId, 'Warm Kick'), sample(snareId, 'Tight Snare')]),
  })
  vi.stubGlobal('api', api)
  const user = userEvent.setup()
  renderSearch()
  await user.type(searchbox(), 'ki')
  expect(
    await screen.findByRole('option', { name: 'Warm Kick' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('option', { name: 'Tight Snare' }),
  ).toBeInTheDocument()
})

test('locating a suggestion opens Samples with the row visible and no playback', async () => {
  const api = createTestApi()
  api.library.list.mockResolvedValue({
    ok: true,
    data: page([sample(kickId, 'Warm Kick')]),
  })
  vi.stubGlobal('api', api)
  const user = userEvent.setup()
  renderSearch()
  await user.type(searchbox(), 'ki')
  await user.click(await screen.findByRole('option', { name: 'Warm Kick' }))
  await waitFor(() =>
    expect(screen.getByTestId('location')).toHaveTextContent('/samples'),
  )
  const probe = screen.getByTestId('location')
  expect(probe).toHaveTextContent(kickId)
  expect(probe).toHaveTextContent('Warm Kick')
  expect(searchbox()).toHaveValue('')
  expect(api.library.setFavorite).not.toHaveBeenCalled()
})

test('keeps the query and retries a failed search from its popup', async () => {
  const api = createTestApi()
  api.library.list
    .mockResolvedValueOnce({
      ok: false,
      error: { code: 'STORAGE_FAILED', message: 'Catalog unavailable.' },
    })
    .mockResolvedValueOnce({
      ok: true,
      data: page([sample(kickId, 'Warm Kick')]),
    })
  vi.stubGlobal('api', api)
  const user = userEvent.setup()
  renderSearch()
  await user.type(searchbox(), 'ki')
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Catalog unavailable.',
  )
  expect(screen.queryByText('No samples match this search.')).toBeNull()
  expect(searchbox()).toHaveValue('ki')
  await user.click(screen.getByRole('button', { name: 'Retry' }))
  expect(
    await screen.findByRole('option', { name: 'Warm Kick' }),
  ).toBeInTheDocument()
  expect(screen.queryByRole('alert')).toBeNull()
})
