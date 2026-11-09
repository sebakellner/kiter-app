import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { useSearchSuggestions } from './useSearchSuggestions'
import { createTestApi } from '../../../../../../tests/support/ui/bridge'
import { deferred } from '../../../../../../tests/support/fixtures/deferred'
import type { IpcResult } from '@shared/ipc'
import type {
  SearchSuggestion,
  SearchSuggestionGroup,
  SearchSuggestResponse,
} from '@shared/ipc/search'

const kickId = '3f9c1b2a-4d5e-4f60-8a71-2b3c4d5e6f70'
const packId = '7a1d2e3f-4b5c-4d6e-9f80-1a2b3c4d5e6f'

function suggestion(
  kind: SearchSuggestion['kind'],
  id: string,
  name: string,
): SearchSuggestion {
  return { kind, id, name }
}

function response(
  query: string,
  ...groups: SearchSuggestionGroup[]
): IpcResult<SearchSuggestResponse> {
  return { ok: true, data: { query, groups } }
}

const sampleGroup = (items: SearchSuggestion[]): SearchSuggestionGroup => ({
  kind: 'sample',
  items,
})

afterEach(() => {
  vi.useRealTimers()
})

test('does not query below two characters and queries the second one', async () => {
  const api = createTestApi()
  api.search.suggest.mockResolvedValue(
    response('ki', sampleGroup([suggestion('sample', kickId, 'Kick Deep')])),
  )
  vi.stubGlobal('api', api)
  const { result, rerender } = renderHook(
    ({ query }) => useSearchSuggestions(query, 0),
    { initialProps: { query: 'k' } },
  )
  expect(api.search.suggest).not.toHaveBeenCalled()
  expect(result.current.groups).toEqual([])
  expect(result.current.loading).toBe(false)
  expect(result.current.error).toBeNull()

  rerender({ query: 'ki' })
  await waitFor(() => expect(api.search.suggest).toHaveBeenCalledTimes(1))
  await waitFor(() =>
    expect(result.current.groups).toEqual([
      sampleGroup([suggestion('sample', kickId, 'Kick Deep')]),
    ]),
  )
  expect(result.current.loading).toBe(false)
})

test('requests one normalized query for every entity kind', async () => {
  const api = createTestApi()
  api.search.suggest.mockResolvedValue(
    response(
      'kick drum',
      sampleGroup([suggestion('sample', kickId, 'Kick Deep')]),
      { kind: 'pack', items: [suggestion('pack', packId, 'Kick Drums')] },
    ),
  )
  vi.stubGlobal('api', api)
  const { result } = renderHook(() => useSearchSuggestions('  Kick   Drum ', 0))
  await waitFor(() => expect(api.search.suggest).toHaveBeenCalledTimes(1))
  expect(api.search.suggest).toHaveBeenCalledExactlyOnceWith({
    query: 'kick drum',
  })
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.groups).toEqual([
    sampleGroup([suggestion('sample', kickId, 'Kick Deep')]),
    { kind: 'pack', items: [suggestion('pack', packId, 'Kick Drums')] },
  ])
})

test('keeps the newest query when an older response settles late', async () => {
  const api = createTestApi()
  const older = deferred<IpcResult<SearchSuggestResponse>>()
  const newer = deferred<IpcResult<SearchSuggestResponse>>()
  api.search.suggest
    .mockReturnValueOnce(older.promise)
    .mockReturnValueOnce(newer.promise)
  vi.stubGlobal('api', api)
  const { result, rerender } = renderHook(
    ({ query }) => useSearchSuggestions(query, 0),
    { initialProps: { query: 'ki' } },
  )
  await waitFor(() => expect(api.search.suggest).toHaveBeenCalledTimes(1))
  rerender({ query: 'kick' })
  await waitFor(() => expect(api.search.suggest).toHaveBeenCalledTimes(2))

  await act(async () =>
    newer.resolve(
      response(
        'kick',
        sampleGroup([suggestion('sample', kickId, 'Kick Deep')]),
      ),
    ),
  )
  await act(async () =>
    older.resolve(
      response('ki', sampleGroup([suggestion('sample', packId, 'Kids Snare')])),
    ),
  )
  expect(result.current.groups).toEqual([
    sampleGroup([suggestion('sample', kickId, 'Kick Deep')]),
  ])
})

test('exposes the failure and retries the same query without waiting', async () => {
  const api = createTestApi()
  api.search.suggest
    .mockResolvedValueOnce({
      ok: false,
      error: { code: 'STORAGE_FAILED', message: 'Catalog unavailable.' },
    })
    .mockResolvedValueOnce(
      response(
        'kick',
        sampleGroup([suggestion('sample', kickId, 'Kick Deep')]),
      ),
    )
  vi.stubGlobal('api', api)
  const { result } = renderHook(() => useSearchSuggestions('kick', 0))
  await waitFor(() => expect(result.current.error).toBe('Catalog unavailable.'))
  expect(result.current.groups).toEqual([])

  act(() => result.current.retry())
  await waitFor(() =>
    expect(result.current.groups).toEqual([
      sampleGroup([suggestion('sample', kickId, 'Kick Deep')]),
    ]),
  )
  expect(result.current.error).toBeNull()
  expect(api.search.suggest).toHaveBeenCalledTimes(2)
  expect(api.search.suggest).toHaveBeenLastCalledWith({ query: 'kick' })
})

test('queries 250 ms after the last keystroke and not before', async () => {
  vi.useFakeTimers()
  const api = createTestApi()
  api.search.suggest.mockResolvedValue(response('kic'))
  vi.stubGlobal('api', api)
  const { rerender } = renderHook(
    ({ query }) => useSearchSuggestions(query, 0),
    { initialProps: { query: '' } },
  )
  rerender({ query: 'ki' })
  act(() => vi.advanceTimersByTime(200))
  expect(api.search.suggest).not.toHaveBeenCalled()

  rerender({ query: 'kic' })
  act(() => vi.advanceTimersByTime(249))
  expect(api.search.suggest).not.toHaveBeenCalled()

  await act(async () => vi.advanceTimersByTime(1))
  expect(api.search.suggest).toHaveBeenCalledTimes(1)
  expect(api.search.suggest).toHaveBeenCalledWith({ query: 'kic' })
})

test('keeps debouncing a query it already dispatched', async () => {
  vi.useFakeTimers()
  const api = createTestApi()
  api.search.suggest.mockResolvedValue(response('kick'))
  vi.stubGlobal('api', api)
  const { rerender } = renderHook(
    ({ query }) => useSearchSuggestions(query, 0),
    { initialProps: { query: '' } },
  )
  rerender({ query: 'kick' })
  await act(async () => vi.advanceTimersByTime(250))
  expect(api.search.suggest).toHaveBeenCalledTimes(1)

  rerender({ query: 'kickk' })
  act(() => vi.advanceTimersByTime(100))
  rerender({ query: 'kick' })
  act(() => vi.advanceTimersByTime(249))
  expect(api.search.suggest).toHaveBeenCalledTimes(1)

  await act(async () => vi.advanceTimersByTime(1))
  expect(api.search.suggest).toHaveBeenCalledTimes(2)
  expect(api.search.suggest).toHaveBeenLastCalledWith({ query: 'kick' })
})

test('re-queries the same query when the catalog revision changes', async () => {
  const api = createTestApi()
  api.search.suggest.mockResolvedValue(response('kick'))
  vi.stubGlobal('api', api)
  const { rerender } = renderHook(
    ({ revision }) => useSearchSuggestions('kick', revision),
    { initialProps: { revision: 0 } },
  )
  await waitFor(() => expect(api.search.suggest).toHaveBeenCalledTimes(1))
  rerender({ revision: 1 })
  await waitFor(() => expect(api.search.suggest).toHaveBeenCalledTimes(2))
  expect(api.search.suggest).toHaveBeenLastCalledWith({ query: 'kick' })
})

test('reports a readable failure when the error carries no message', async () => {
  const api = createTestApi()
  api.search.suggest.mockRejectedValue(new Error(''))
  vi.stubGlobal('api', api)
  const { result } = renderHook(() => useSearchSuggestions('kick', 0))
  await waitFor(() =>
    expect(result.current.error).toBe('Unable to search the library.'),
  )
})

test('does not let a catalog revision change jump a pending debounce', async () => {
  vi.useFakeTimers()
  const api = createTestApi()
  api.search.suggest.mockResolvedValue(response('kick'))
  vi.stubGlobal('api', api)
  const { rerender } = renderHook(
    ({ query, revision }) => useSearchSuggestions(query, revision),
    { initialProps: { query: '', revision: 0 } },
  )
  rerender({ query: 'kick', revision: 0 })
  act(() => vi.advanceTimersByTime(100))

  rerender({ query: 'kick', revision: 1 })
  expect(api.search.suggest).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(249))
  expect(api.search.suggest).not.toHaveBeenCalled()

  await act(async () => vi.advanceTimersByTime(1))
  expect(api.search.suggest).toHaveBeenCalledTimes(1)
  expect(api.search.suggest).toHaveBeenCalledWith({ query: 'kick' })
})
