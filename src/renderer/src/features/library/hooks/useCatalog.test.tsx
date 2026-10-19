import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { useCatalog } from './useCatalog'
import { createTestApi } from '../../../../../../tests/support/ui/bridge'
import { deferred } from '../../../../../../tests/support/fixtures/deferred'
import type { IpcResult } from '@shared/ipc'
import type { LibraryPage } from '@shared/ipc/library'

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
    categoryIds: ['kick'],
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
    categoryIds: ['kick'],
    genreIds: ['techno'],
    offset: 0,
  })
})
