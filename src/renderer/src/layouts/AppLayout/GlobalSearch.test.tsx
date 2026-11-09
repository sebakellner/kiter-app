import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { GlobalSearch } from './GlobalSearch'
import { createTestApi } from '../../../../../tests/support/ui/bridge'
import type { IpcResult } from '@shared/ipc'
import type {
  SearchSuggestion,
  SearchSuggestionGroup,
  SearchSuggestResponse,
  SuggestionKind,
} from '@shared/ipc/search'

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

const sampleId = '3f9c1b2a-4d5e-4f60-8a71-2b3c4d5e6f70'
const packId = '7a1d2e3f-4b5c-4d6e-9f80-1a2b3c4d5e6f'
const collectionId = '1b2c3d4e-5f60-4a71-8b92-c3d4e5f60718'
const instrumentId = '2c3d4e5f-6071-4b82-9ca3-d4e5f6071829'
const authorId = '3d4e5f60-7182-4c93-adb4-e5f60718293a'
const genreId = '4e5f6071-8293-4da4-bec5-f60718293a4b'

function suggestion(
  kind: SuggestionKind,
  id: string,
  name: string,
): SearchSuggestion {
  return { kind, id, name }
}

function grouped(
  query: string,
  items: SearchSuggestion[],
): IpcResult<SearchSuggestResponse> {
  const order: SuggestionKind[] = [
    'sample',
    'pack',
    'collection',
    'instrument',
    'author',
    'genre',
  ]
  const groups: SearchSuggestionGroup[] = order
    .map((kind) => ({
      kind,
      items: items.filter((item) => item.kind === kind),
    }))
    .filter((group) => group.items.length > 0)
  return { ok: true, data: { query, groups } }
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
        <Route path="/packs/:id" element={<LocationProbe />} />
        <Route path="/collections/:id" element={<LocationProbe />} />
        <Route path="/instruments" element={<LocationProbe />} />
        <Route path="/authors" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

function searchbox(): HTMLElement {
  return screen.getByRole('combobox', { name: 'Search library' })
}

async function searchFor(
  items: SearchSuggestion[],
  query = 'ki',
): Promise<ReturnType<typeof userEvent.setup>> {
  const api = createTestApi()
  api.search.suggest.mockResolvedValue(grouped(query, items))
  vi.stubGlobal('api', api)
  const user = userEvent.setup()
  renderSearch()
  await user.type(searchbox(), query)
  return user
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
  expect(api.search.suggest).not.toHaveBeenCalled()
})

test('renders one labelled group per entity kind, Samples first', async () => {
  await searchFor([
    suggestion('sample', sampleId, 'Warm Kick'),
    suggestion('pack', packId, 'Kick Pack'),
    suggestion('genre', genreId, 'House'),
  ])

  expect(
    await screen.findByRole('option', { name: 'Warm Kick' }),
  ).toBeInTheDocument()
  const groups = screen.getAllByRole('group')
  expect(
    groups.map((group) => within(group).getAllByRole('option')[0].textContent),
  ).toEqual(['Warm Kick', 'Kick Pack', 'House'])
  expect(
    within(screen.getByRole('group', { name: 'Samples' })).getByRole('option', {
      name: 'Warm Kick',
    }),
  ).toBeInTheDocument()
  expect(
    within(screen.getByRole('group', { name: 'Packs' })).getByRole('option', {
      name: 'Kick Pack',
    }),
  ).toBeInTheDocument()
  expect(
    within(screen.getByRole('group', { name: 'Genres' })).getByRole('option', {
      name: 'House',
    }),
  ).toBeInTheDocument()
  expect(
    screen.getAllByRole('option').map((option) => option.textContent),
  ).toEqual(['Warm Kick', 'Kick Pack', 'House'])
})

test('moves the active option across groups with the arrow keys', async () => {
  const api = createTestApi()
  api.search.suggest.mockResolvedValue(
    grouped('ki', [
      suggestion('sample', sampleId, 'Warm Kick'),
      suggestion('pack', packId, 'Kick Pack'),
    ]),
  )
  vi.stubGlobal('api', api)
  const user = userEvent.setup()
  renderSearch()
  await user.type(searchbox(), 'ki')
  await screen.findByRole('option', { name: 'Warm Kick' })
  await user.keyboard('{ArrowDown}{ArrowDown}')
  expect(screen.getByRole('option', { name: 'Kick Pack' })).toHaveAttribute(
    'data-active',
    'true',
  )
  await user.keyboard('{Enter}')
  await waitFor(() =>
    expect(screen.getByTestId('location')).toHaveTextContent(
      `/packs/${packId}`,
    ),
  )
  expect(searchbox()).toHaveValue('')
})

test('locating a Sample suggestion opens Samples with the row visible and no playback', async () => {
  const api = createTestApi()
  api.search.suggest.mockResolvedValue(
    grouped('ki', [suggestion('sample', sampleId, 'Warm Kick')]),
  )
  vi.stubGlobal('api', api)
  const user = userEvent.setup()
  renderSearch()
  await user.type(searchbox(), 'ki')
  await user.click(await screen.findByRole('option', { name: 'Warm Kick' }))
  await waitFor(() =>
    expect(screen.getByTestId('location')).toHaveTextContent('/samples'),
  )
  const probe = screen.getByTestId('location')
  expect(probe).toHaveTextContent(sampleId)
  expect(probe).toHaveTextContent('Warm Kick')
  expect(searchbox()).toHaveValue('')
  expect(api.library.setFavorite).not.toHaveBeenCalled()
  expect(api.library.startDrag).not.toHaveBeenCalled()
})

test('opens a Pack suggestion on its detail route', async () => {
  const user = await searchFor([suggestion('pack', packId, 'Kick Pack')])
  await user.click(await screen.findByRole('option', { name: 'Kick Pack' }))
  await waitFor(() =>
    expect(screen.getByTestId('location')).toHaveTextContent(
      `/packs/${packId}`,
    ),
  )
})

test('opens a Collection suggestion on its detail route', async () => {
  const user = await searchFor([
    suggestion('collection', collectionId, 'Kick Kit'),
  ])
  await user.click(await screen.findByRole('option', { name: 'Kick Kit' }))
  await waitFor(() =>
    expect(screen.getByTestId('location')).toHaveTextContent(
      `/collections/${collectionId}`,
    ),
  )
})

test('opens Instruments on its list destination, which has no detail route', async () => {
  const user = await searchFor([suggestion('instrument', instrumentId, 'Kick')])
  await user.click(await screen.findByRole('option', { name: 'Kick' }))
  await waitFor(() =>
    expect(screen.getByTestId('location')).toHaveTextContent('/instruments'),
  )
})

test('opens Authors on its list destination, which has no detail route', async () => {
  const user = await searchFor([suggestion('author', authorId, 'Warm Studio')])
  await user.click(await screen.findByRole('option', { name: 'Warm Studio' }))
  await waitFor(() =>
    expect(screen.getByTestId('location')).toHaveTextContent('/authors'),
  )
})

test('opens a Genre suggestion on Samples filtered by that Genre', async () => {
  const user = await searchFor([suggestion('genre', genreId, 'House')])
  await user.click(await screen.findByRole('option', { name: 'House' }))
  await waitFor(() =>
    expect(screen.getByTestId('location')).toHaveTextContent('/samples'),
  )
  const probe = screen.getByTestId('location')
  expect(probe).toHaveTextContent(genreId)
  expect(probe).toHaveTextContent('House')
  expect(searchbox()).toHaveValue('')
})

test('keeps the query and retries a failed search from its popup', async () => {
  const api = createTestApi()
  api.search.suggest
    .mockResolvedValueOnce({
      ok: false,
      error: { code: 'STORAGE_FAILED', message: 'Catalog unavailable.' },
    })
    .mockResolvedValueOnce(
      grouped('ki', [suggestion('sample', sampleId, 'Warm Kick')]),
    )
  vi.stubGlobal('api', api)
  const user = userEvent.setup()
  renderSearch()
  await user.type(searchbox(), 'ki')
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Catalog unavailable.',
  )
  expect(screen.queryByText('No matches in your library.')).toBeNull()
  expect(searchbox()).toHaveValue('ki')
  await user.click(screen.getByRole('button', { name: 'Retry' }))
  expect(
    await screen.findByRole('option', { name: 'Warm Kick' }),
  ).toBeInTheDocument()
  expect(screen.queryByRole('alert')).toBeNull()
})
