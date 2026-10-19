import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { useCatalog } from './useCatalog'
import { createTestApi } from '../../../../../../tests/support/ui/bridge'
import { deferred } from '../../../../../../tests/support/fixtures/deferred'
import type { IpcResult } from '@shared/ipc'
import type { LibraryPage } from '@shared/ipc/library'
import type { SampleTypeFilter } from '@shared/features/library/schemas'

const empty: LibraryPage = { items: [], total: 0, limit: 50, offset: 0 }

test('ignores stale pages and preserves the last valid result when refresh fails', async () => {
  const api = createTestApi()
  const pending = deferred<IpcResult<LibraryPage>>()
  api.library.list
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce({ ok: true, data: empty })
    .mockResolvedValueOnce({
      ok: false,
      error: { code: 'STORAGE_FAILED', message: 'Catalog unavailable.' },
    })
  vi.stubGlobal('api', api)
  const { result, rerender } = renderHook(
    ({ revision }) => useCatalog(false, revision),
    { initialProps: { revision: 0 } },
  )
  rerender({ revision: 1 })
  await waitFor(() => expect(result.current.page).toEqual(empty))
  await act(async () =>
    pending.resolve({ ok: true, data: { ...empty, total: 7 } }),
  )
  expect(result.current.page).toEqual(empty)
  act(() => result.current.refresh())
  await waitFor(() => expect(result.current.error).toBe('Catalog unavailable.'))
  expect(result.current.page).toEqual(empty)
  expect(result.current.loading).toBe(false)
})

test('returns to a valid page after the final favorite on the last page is removed', async () => {
  const api = createTestApi()
  api.library.list
    .mockResolvedValueOnce({ ok: true, data: { ...empty, total: 51 } })
    .mockResolvedValueOnce({
      ok: true,
      data: { ...empty, offset: 50, total: 50 },
    })
    .mockResolvedValueOnce({ ok: true, data: { ...empty, total: 50 } })
  vi.stubGlobal('api', api)
  const { result } = renderHook(() => useCatalog(true, 0))
  await waitFor(() => expect(result.current.loading).toBe(false))
  act(() => result.current.load(50))
  await waitFor(() => expect(result.current.page?.total).toBe(50))
  expect(result.current.page?.offset).toBe(0)
  expect(api.library.list).toHaveBeenLastCalledWith({
    favoritesOnly: true,
    offset: 0,
  })
})

test('revalidates an out-of-range restored offset before exposing the page', async () => {
  const api = createTestApi()
  const fallback = deferred<IpcResult<LibraryPage>>()
  api.library.list
    .mockResolvedValueOnce({
      ok: true,
      data: { ...empty, offset: 100, total: 0 },
    })
    .mockReturnValueOnce(fallback.promise)
  vi.stubGlobal('api', api)
  const { result } = renderHook(() => useCatalog(true, 0, 100))
  await waitFor(() => expect(api.library.list).toHaveBeenCalledTimes(2))
  expect(
    api.library.list.mock.calls.map(([request]) => request?.offset),
  ).toEqual([100, 0])
  expect(result.current.page).toBeNull()
  expect(result.current.loading).toBe(true)
  await act(async () => fallback.resolve({ ok: true, data: empty }))
  expect(result.current.page).toEqual(empty)
  expect(result.current.loading).toBe(false)
})

test('retry preserves the restored offset after an initial load failure', async () => {
  const api = createTestApi()
  api.library.list
    .mockResolvedValueOnce({
      ok: false,
      error: { code: 'STORAGE_FAILED', message: 'Catalog unavailable.' },
    })
    .mockResolvedValueOnce({
      ok: true,
      data: { ...empty, offset: 50, total: 50 },
    })
    .mockResolvedValueOnce({ ok: true, data: empty })
  vi.stubGlobal('api', api)
  const { result } = renderHook(() => useCatalog(false, 0, 50))
  await waitFor(() => expect(result.current.error).toBe('Catalog unavailable.'))
  expect(result.current.page).toBeNull()
  act(() => result.current.refresh())
  await waitFor(() => expect(result.current.page).toEqual(empty))
  expect(
    api.library.list.mock.calls.map(([request]) => request?.offset),
  ).toEqual([50, 50, 0])
  expect(result.current.error).toBeNull()
  expect(result.current.loading).toBe(false)
})

test('changing Genres resets pagination, rejects stale results and retains both filter groups on fallback and retry', async () => {
  const api = createTestApi()
  const pending = deferred<IpcResult<LibraryPage>>()
  api.library.list
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce({ ok: true, data: { ...empty, total: 2 } })
    .mockResolvedValueOnce({
      ok: true,
      data: { ...empty, offset: 50, total: 2 },
    })
    .mockResolvedValueOnce({ ok: true, data: { ...empty, total: 2 } })
    .mockResolvedValueOnce({
      ok: false,
      error: { code: 'STORAGE_FAILED', message: 'Catalog unavailable.' },
    })
    .mockResolvedValueOnce({
      ok: true,
      data: { ...empty, offset: 50, total: 2 },
    })
    .mockResolvedValueOnce({ ok: true, data: { ...empty, total: 2 } })
  vi.stubGlobal('api', api)
  const { result, rerender } = renderHook(
    ({ genres }) => useCatalog(true, 0, 50, ['kick'], genres),
    { initialProps: { genres: ['house'] } },
  )
  rerender({ genres: ['techno'] })
  await waitFor(() => expect(result.current.page?.total).toBe(2))
  expect(api.library.list).toHaveBeenLastCalledWith({
    favoritesOnly: true,
    instrumentIds: ['kick'],
    genreIds: ['techno'],
    offset: 0,
  })
  await act(async () =>
    pending.resolve({ ok: true, data: { ...empty, offset: 50, total: 99 } }),
  )
  expect(result.current.page?.total).toBe(2)
  act(() => result.current.load(50))
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.page?.offset).toBe(0)
  act(() => result.current.refresh())
  await waitFor(() => expect(result.current.error).toBe('Catalog unavailable.'))
  expect(result.current.page?.total).toBe(2)
  act(() => result.current.refresh())
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.error).toBeNull()
  expect(api.library.list).toHaveBeenLastCalledWith({
    favoritesOnly: true,
    instrumentIds: ['kick'],
    genreIds: ['techno'],
    offset: 0,
  })
})

test('changing Sample types resets pagination, rejects stale pages and retains all filters on fallback and retry', async () => {
  const api = createTestApi()
  const pending = deferred<IpcResult<LibraryPage>>()
  api.library.list
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce({ ok: true, data: { ...empty, total: 2 } })
    .mockResolvedValueOnce({
      ok: true,
      data: { ...empty, offset: 50, total: 2 },
    })
    .mockResolvedValueOnce({ ok: true, data: { ...empty, total: 2 } })
    .mockResolvedValueOnce({
      ok: false,
      error: { code: 'STORAGE_FAILED', message: 'Catalog unavailable.' },
    })
    .mockResolvedValueOnce({
      ok: true,
      data: { ...empty, offset: 50, total: 2 },
    })
    .mockResolvedValueOnce({ ok: true, data: { ...empty, total: 2 } })
  vi.stubGlobal('api', api)
  const initialProps: { types: SampleTypeFilter } = { types: ['loop'] }
  const { result, rerender } = renderHook(
    ({ types }) => useCatalog(true, 0, 50, ['kick'], ['house'], types),
    { initialProps },
  )
  expect(api.library.list).toHaveBeenLastCalledWith({
    favoritesOnly: true,
    instrumentIds: ['kick'],
    genreIds: ['house'],
    sampleTypes: ['loop'],
    offset: 50,
  })
  rerender({ types: ['unknown', 'one-shot'] })
  await waitFor(() => expect(result.current.page?.total).toBe(2))
  const filters = {
    favoritesOnly: true,
    instrumentIds: ['kick'],
    genreIds: ['house'],
    sampleTypes: ['one-shot', 'unknown'],
  }
  expect(api.library.list).toHaveBeenLastCalledWith({ ...filters, offset: 0 })
  await act(async () =>
    pending.resolve({ ok: true, data: { ...empty, offset: 50, total: 99 } }),
  )
  expect(result.current.page?.total).toBe(2)
  rerender({ types: ['one-shot', 'unknown'] })
  expect(api.library.list).toHaveBeenCalledTimes(2)
  act(() => result.current.load(50))
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.page?.offset).toBe(0)
  act(() => result.current.refresh())
  await waitFor(() => expect(result.current.error).toBe('Catalog unavailable.'))
  expect(result.current.page?.total).toBe(2)
  act(() => result.current.refresh())
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.error).toBeNull()
  expect(
    api.library.list.mock.calls.slice(2).map(([request]) => request),
  ).toEqual([
    { ...filters, offset: 50 },
    { ...filters, offset: 0 },
    { ...filters, offset: 50 },
    { ...filters, offset: 50 },
    { ...filters, offset: 0 },
  ])
})

test('search waits 250ms after the last edit, ignores obsolete pages immediately and clears to page one', async () => {
  vi.useFakeTimers()
  try {
    const api = createTestApi()
    const pending = deferred<IpcResult<LibraryPage>>()
    api.library.list
      .mockResolvedValueOnce({ ok: true, data: { ...empty, total: 3 } })
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ ok: true, data: { ...empty, total: 1 } })
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'STORAGE_FAILED', message: 'Search unavailable.' },
      })
      .mockResolvedValueOnce({ ok: true, data: { ...empty, total: 1 } })
      .mockResolvedValueOnce({ ok: true, data: { ...empty, total: 3 } })
    vi.stubGlobal('api', api)
    const { result, rerender, unmount } = renderHook(
      ({ search }) =>
        useCatalog(true, 0, 50, ['drums'], ['house'], ['loop'], search),
      { initialProps: { search: '' } },
    )
    await act(async () => {})
    expect(result.current.page?.total).toBe(3)
    rerender({ search: 'k' })
    expect(api.library.list).toHaveBeenCalledTimes(1)
    rerender({ search: 'kick' })
    expect(result.current.loading).toBe(true)
    await act(async () => vi.advanceTimersByTime(249))
    expect(api.library.list).toHaveBeenCalledTimes(1)
    rerender({ search: 'kicker' })
    await act(async () => vi.advanceTimersByTime(249))
    expect(api.library.list).toHaveBeenCalledTimes(1)
    await act(async () => vi.advanceTimersByTime(1))
    const filters = {
      favoritesOnly: true,
      instrumentIds: ['drums'],
      genreIds: ['house'],
      sampleTypes: ['loop'],
      offset: 0,
    }
    expect(api.library.list).toHaveBeenLastCalledWith({
      ...filters,
      search: 'kicker',
    })
    rerender({ search: 'clap' })
    await act(async () =>
      pending.resolve({ ok: true, data: { ...empty, offset: 50, total: 99 } }),
    )
    expect(result.current.page?.total).toBe(3)
    expect(api.library.list).toHaveBeenCalledTimes(2)
    await act(async () => vi.advanceTimersByTime(250))
    expect(result.current.page?.total).toBe(1)
    expect(api.library.list).toHaveBeenLastCalledWith({
      ...filters,
      search: 'clap',
    })
    act(() => result.current.refresh())
    await act(async () => {})
    expect(result.current.error).toBe('Search unavailable.')
    expect(result.current.page?.total).toBe(1)
    act(() => result.current.refresh())
    await act(async () => {})
    expect(result.current.error).toBeNull()
    expect(api.library.list).toHaveBeenLastCalledWith({
      ...filters,
      search: 'clap',
    })
    rerender({ search: '' })
    await act(async () => {})
    expect(api.library.list).toHaveBeenLastCalledWith(filters)
    expect(result.current.page?.total).toBe(3)
    rerender({ search: 'canceled' })
    unmount()
    await act(async () => vi.advanceTimersByTime(250))
    expect(api.library.list).toHaveBeenCalledTimes(6)
  } finally {
    vi.useRealTimers()
  }
})

test('restored search queries load immediately and retain criteria during page fallback', async () => {
  const api = createTestApi()
  api.library.list
    .mockResolvedValueOnce({
      ok: true,
      data: { ...empty, offset: 50, total: 1 },
    })
    .mockResolvedValueOnce({ ok: true, data: { ...empty, total: 1 } })
  vi.stubGlobal('api', api)
  const { result } = renderHook(() =>
    useCatalog(false, 0, 50, [], [], ['unknown'], 'KÍCK'),
  )
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(api.library.list.mock.calls.map(([request]) => request)).toEqual([
    {
      favoritesOnly: false,
      offset: 50,
      sampleTypes: ['unknown'],
      search: 'kick',
    },
    {
      favoritesOnly: false,
      offset: 0,
      sampleTypes: ['unknown'],
      search: 'kick',
    },
  ])
  expect(result.current.page?.offset).toBe(0)
})
