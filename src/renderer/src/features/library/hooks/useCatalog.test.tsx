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
