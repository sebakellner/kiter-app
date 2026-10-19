import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { CollectionSummary } from '@shared/domain/collection'
import type { IpcResult } from '@shared/ipc/result'
import { makeCollectionSummary } from '../../../../../../tests/support/fixtures/collection'
import { deferred } from '../../../../../../tests/support/fixtures/deferred'
import { createTestApi } from '../../../../../../tests/support/ui/bridge'
import { useCollectionDetail } from './useCollectionDetail'

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
