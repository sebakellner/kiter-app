import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type {
  CollectionPage,
  CollectionSummary,
} from '@shared/domain/collection'
import type { IpcResult } from '@shared/ipc/result'
import { makeCollectionSummary } from '../../../../../tests/support/fixtures/collection'
import { deferred } from '../../../../../tests/support/fixtures/deferred'
import { createTestApi } from '../../../../../tests/support/ui/bridge'
import { useCollections, useCollectionDetail } from './useCollections'

test('Collection pages retain last valid data on failure, retry and ignore superseded replies', async () => {
  const api = createTestApi()
  vi.stubGlobal('api', api)
  const collection = makeCollectionSummary()
  const first = { items: [collection], total: 101, offset: 0, limit: 50 }
  api.collections.list.mockResolvedValueOnce({ ok: true, data: first })
  const { result } = renderHook(() => useCollections(0))
  await waitFor(() => expect(result.current.page).toEqual(first))
  api.collections.list.mockResolvedValueOnce({
    ok: false,
    error: { code: 'STORAGE_FAILED', message: 'Storage unavailable.' },
  })
  act(() => result.current.load(50))
  await waitFor(() => expect(result.current.error).toBe('Storage unavailable.'))
  expect(result.current.page).toEqual(first)
  const old = deferred<IpcResult<CollectionPage<CollectionSummary>>>()
  api.collections.list.mockReturnValueOnce(old.promise)
  act(() => result.current.refresh())
  expect(result.current.loading).toBe(true)
  const latest = { items: [collection], total: 101, offset: 100, limit: 50 }
  api.collections.list.mockResolvedValueOnce({ ok: true, data: latest })
  act(() => result.current.load(100))
  await waitFor(() => expect(result.current.page).toEqual(latest))
  await act(async () => old.resolve({ ok: true, data: first }))
  expect(result.current.page).toEqual(latest)
  expect(result.current.error).toBeNull()
})

test('Collection pages clamp a restored offset after the result set shrinks', async () => {
  const api = createTestApi()
  vi.stubGlobal('api', api)
  const collection = makeCollectionSummary()
  api.collections.list.mockResolvedValueOnce({
    ok: true,
    data: { items: [], total: 1, offset: 50, limit: 50 },
  })
  api.collections.list.mockResolvedValueOnce({
    ok: true,
    data: { items: [collection], total: 1, offset: 0, limit: 50 },
  })
  const { result } = renderHook(() => useCollections(50))
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.page?.items).toEqual([collection])
  expect(
    api.collections.list.mock.calls.map(([request]) => request?.offset),
  ).toEqual([50, 0])
})

test('Collection details reject stale identities and never show another Collection after navigation', async () => {
  const api = createTestApi()
  vi.stubGlobal('api', api)
  const first = makeCollectionSummary()
  const second = makeCollectionSummary({
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Second',
  })
  const old = deferred<IpcResult<CollectionSummary>>()
  api.collections.get.mockReturnValueOnce(old.promise)
  const { result, rerender } = renderHook(({ id }) => useCollectionDetail(id), {
    initialProps: { id: first.id },
  })
  api.collections.get.mockResolvedValueOnce({ ok: true, data: second })
  rerender({ id: second.id })
  await waitFor(() => expect(result.current.collection).toEqual(second))
  await act(async () => old.resolve({ ok: true, data: first }))
  expect(result.current.collection).toEqual(second)
  api.collections.get.mockResolvedValueOnce({
    ok: false,
    error: { code: 'STORAGE_FAILED', message: 'Retry storage.' },
  })
  act(() => result.current.refresh())
  await waitFor(() => expect(result.current.error).toBe('Retry storage.'))
  expect(result.current.collection).toEqual(second)
  api.collections.get.mockResolvedValueOnce({
    ok: false,
    error: { code: 'NOT_FOUND', message: 'The Collection no longer exists.' },
  })
  act(() => result.current.refresh())
  await waitFor(() => expect(result.current.unavailable).toBe(true))
  expect(result.current.collection).toBeNull()
})
