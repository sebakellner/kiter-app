import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { useSampleSuggestions } from './useSampleSuggestions'
import { createTestApi } from '../../../../../../tests/support/ui/bridge'
import { deferred } from '../../../../../../tests/support/fixtures/deferred'
import type { IpcResult } from '@shared/ipc'
import type { CatalogAudioSample, LibraryPage } from '@shared/ipc/library'

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

const ok = (data: LibraryPage): IpcResult<LibraryPage> => ({ ok: true, data })

test('does not query below two characters and queries the second one', async () => {
  const api = createTestApi()
  api.library.list.mockResolvedValue(ok(page([sample('a', 'Kick Deep')])))
  vi.stubGlobal('api', api)
  const { result, rerender } = renderHook(
    ({ query }) => useSampleSuggestions(query, 0),
    { initialProps: { query: 'k' } },
  )
  expect(api.library.list).not.toHaveBeenCalled()
  expect(result.current.suggestions).toEqual([])
  expect(result.current.loading).toBe(false)
  expect(result.current.error).toBeNull()

  rerender({ query: 'ki' })
  await waitFor(() => expect(api.library.list).toHaveBeenCalledTimes(1))
  await waitFor(() =>
    expect(result.current.suggestions).toEqual([sample('a', 'Kick Deep')]),
  )
  expect(result.current.loading).toBe(false)
})

test('requests five normalized suggestions for the current query', async () => {
  const api = createTestApi()
  api.library.list.mockResolvedValue(ok(page([])))
  vi.stubGlobal('api', api)
  const { result } = renderHook(() => useSampleSuggestions('  Kick   Drum ', 0))
  await waitFor(() => expect(api.library.list).toHaveBeenCalledTimes(1))
  expect(api.library.list).toHaveBeenCalledWith({
    search: 'kick drum',
    limit: 5,
  })
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.suggestions).toEqual([])
})

test('keeps the newest query when an older response settles late', async () => {
  const api = createTestApi()
  const older = deferred<IpcResult<LibraryPage>>()
  const newer = deferred<IpcResult<LibraryPage>>()
  api.library.list
    .mockReturnValueOnce(older.promise)
    .mockReturnValueOnce(newer.promise)
  vi.stubGlobal('api', api)
  const { result, rerender } = renderHook(
    ({ query }) => useSampleSuggestions(query, 0),
    { initialProps: { query: 'ki' } },
  )
  await waitFor(() => expect(api.library.list).toHaveBeenCalledTimes(1))
  rerender({ query: 'kick' })
  await waitFor(() => expect(api.library.list).toHaveBeenCalledTimes(2))

  await act(async () => newer.resolve(ok(page([sample('b', 'Kick Deep')]))))
  await act(async () => older.resolve(ok(page([sample('c', 'Kids Snare')]))))
  expect(result.current.suggestions).toEqual([sample('b', 'Kick Deep')])
})

test('exposes the failure and retries the same query without waiting', async () => {
  const api = createTestApi()
  api.library.list
    .mockResolvedValueOnce({
      ok: false,
      error: { code: 'STORAGE_FAILED', message: 'Catalog unavailable.' },
    })
    .mockResolvedValueOnce(ok(page([sample('a', 'Kick Deep')])))
  vi.stubGlobal('api', api)
  const { result } = renderHook(() => useSampleSuggestions('kick', 0))
  await waitFor(() => expect(result.current.error).toBe('Catalog unavailable.'))
  expect(result.current.suggestions).toEqual([])

  act(() => result.current.retry())
  await waitFor(() =>
    expect(result.current.suggestions).toEqual([sample('a', 'Kick Deep')]),
  )
  expect(result.current.error).toBeNull()
  expect(api.library.list).toHaveBeenCalledTimes(2)
  expect(api.library.list).toHaveBeenLastCalledWith({
    search: 'kick',
    limit: 5,
  })
})
