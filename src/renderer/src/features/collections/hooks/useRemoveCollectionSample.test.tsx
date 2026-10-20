import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { IpcResult } from '@shared/ipc/result'
import type { CollectionMembershipResult } from '@shared/domain/collection'
import { useRemoveCollectionSample } from './useRemoveCollectionSample'
import { createTestApi } from '../../../../../../tests/support/ui/bridge'
import { deferred } from '../../../../../../tests/support/fixtures/deferred'

test('removal preserves failed targets for retry, blocks duplicate writes and refreshes only after success', async () => {
  const api = createTestApi()
  vi.stubGlobal('api', api)
  const pending = deferred<IpcResult<CollectionMembershipResult>>()
  api.collections.setMembership
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce({
      ok: true,
      data: { assigned: false, changed: true },
    })
  const onChanged = vi.fn()
  const collectionId = '11111111-1111-4111-8111-111111111111'
  const sample = {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Kick 808',
  }
  const { result, unmount } = renderHook(() =>
    useRemoveCollectionSample(collectionId, onChanged),
  )
  let run: Promise<void>
  act(() => {
    run = result.current.remove(sample)
    void result.current.remove(sample)
  })
  expect(result.current.pending).toBe(true)
  expect(api.collections.setMembership).toHaveBeenCalledOnce()
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  await act(async () => {
    pending.resolve({
      ok: false,
      error: { code: 'STORAGE_FAILED', message: 'Removal failed.' },
    })
    await run
  })
  expect(result.current.error).toBe('Removal failed.')
  expect(onChanged).not.toHaveBeenCalled()
  await act(async () => result.current.retry())
  expect(result.current.error).toBeNull()
  expect(result.current.notice).toContain('Sample remains in your library')
  expect(result.current.notice).toContain('Kick 808 removed')
  expect(onChanged).toHaveBeenCalledOnce()
  expect(
    api.collections.setMembership.mock.calls.map(([request]) => request),
  ).toEqual([
    { collectionId, sampleId: sample.id, assigned: false },
    { collectionId, sampleId: sample.id, assigned: false },
  ])
  unmount()
  const after = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(after)
  expect(after.defaultPrevented).toBe(false)
})

test('an unmounted removal does not refresh a different view after its write completes', async () => {
  const api = createTestApi()
  vi.stubGlobal('api', api)
  const pending = deferred<IpcResult<CollectionMembershipResult>>()
  api.collections.setMembership.mockReturnValueOnce(pending.promise)
  const onChanged = vi.fn()
  const { result, unmount } = renderHook(() =>
    useRemoveCollectionSample(
      '11111111-1111-4111-8111-111111111111',
      onChanged,
    ),
  )
  act(() => {
    void result.current.remove({
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Kick 808',
    })
  })
  unmount()
  await act(async () =>
    pending.resolve({ ok: true, data: { assigned: false, changed: true } }),
  )
  expect(onChanged).not.toHaveBeenCalled()
  await waitFor(() =>
    expect(api.collections.setMembership).toHaveBeenCalledOnce(),
  )
})
