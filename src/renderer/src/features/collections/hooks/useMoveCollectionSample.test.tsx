import { act, renderHook } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { LibraryPage } from '@shared/ipc/library'
import type { CollectionMoveResult } from '@shared/domain/collection'
import type { IpcResult } from '@shared/ipc/result'
import { createTestApi } from '../../../../../../tests/support/ui/bridge'
import { deferred } from '../../../../../../tests/support/fixtures/deferred'
import { useMoveCollectionSample } from './useMoveCollectionSample'

const collectionId = '11111111-1111-4111-8111-111111111111'
const sample = {
  id: '22222222-2222-4222-8222-222222222222',
  relativePath: 'kick.wav',
}
const page: LibraryPage = {
  items: [],
  total: 52,
  offset: 0,
  limit: 50,
  collectionOrderToken: 'a'.repeat(64),
}
const saved: CollectionMoveResult = {
  collectionId,
  sampleId: sample.id,
  changed: true,
  index: 50,
  orderToken: 'b'.repeat(64),
}

test('moves are serialized, remain pessimistic and require a fresh page before another intent', async () => {
  const api = createTestApi()
  vi.stubGlobal('api', api)
  const close = vi.spyOn(window, 'close').mockImplementation(() => {})
  const pending = deferred<IpcResult<CollectionMoveResult>>()
  api.collections.moveSample
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce({ ok: true, data: { ...saved, index: 49 } })
  const onMoved = vi.fn()
  const onRefresh = vi.fn()
  const { result, rerender } = renderHook(
    ({ currentPage }) =>
      useMoveCollectionSample({
        collectionId,
        page: currentPage,
        enabled: true,
        loading: false,
        pageError: null,
        onMoved,
        onRefresh,
      }),
    { initialProps: { currentPage: page } },
  )
  let run: Promise<void>
  act(() => {
    run = result.current.move(sample, 'down')
    void result.current.move(sample, 'down')
  })
  expect(api.collections.moveSample).toHaveBeenCalledOnce()
  expect(onMoved).not.toHaveBeenCalled()
  expect(result.current.pending).toBe(true)
  const unload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(unload)
  expect(unload.defaultPrevented).toBe(true)
  await act(async () => {
    pending.resolve({ ok: true, data: saved })
    await run
  })
  expect(onMoved).toHaveBeenCalledWith(saved)
  expect(close).toHaveBeenCalledOnce()
  expect(onRefresh).not.toHaveBeenCalled()
  expect(result.current.notice).toContain('position 51')
  expect(result.current.blocked).toBe(true)
  await act(async () => result.current.move(sample, 'down'))
  expect(api.collections.moveSample).toHaveBeenCalledOnce()
  rerender({
    currentPage: {
      ...page,
      offset: 50,
      collectionOrderToken: saved.orderToken,
    },
  })
  expect(result.current.blocked).toBe(false)
  await act(async () => result.current.move(sample, 'up'))
  expect(api.collections.moveSample).toHaveBeenLastCalledWith({
    collectionId,
    sampleId: sample.id,
    direction: 'up',
    token: saved.orderToken,
  })
  close.mockRestore()
})

test('stale or failed moves reload without automatically replaying against the new order', async () => {
  const api = createTestApi()
  vi.stubGlobal('api', api)
  api.collections.moveSample
    .mockResolvedValueOnce({
      ok: false,
      error: { code: 'STALE_REVIEW', message: 'The order changed.' },
    })
    .mockResolvedValueOnce({
      ok: false,
      error: { code: 'STORAGE_FAILED', message: 'Order could not be saved.' },
    })
  const onMoved = vi.fn()
  const onRefresh = vi.fn()
  const { result, rerender } = renderHook(
    ({ currentPage }) =>
      useMoveCollectionSample({
        collectionId,
        page: currentPage,
        enabled: true,
        loading: false,
        pageError: null,
        onMoved,
        onRefresh,
      }),
    { initialProps: { currentPage: page } },
  )
  await act(async () => result.current.move(sample, 'down'))
  expect(result.current.error).toBe('The order changed.')
  expect(result.current.notice).toBeNull()
  expect(onMoved).not.toHaveBeenCalled()
  expect(onRefresh).toHaveBeenCalledOnce()
  rerender({ currentPage: { ...page, collectionOrderToken: 'c'.repeat(64) } })
  expect(api.collections.moveSample).toHaveBeenCalledOnce()
  await act(async () => result.current.move(sample, 'down'))
  expect(api.collections.moveSample).toHaveBeenLastCalledWith({
    collectionId,
    sampleId: sample.id,
    direction: 'down',
    token: 'c'.repeat(64),
  })
  expect(result.current.error).toBe('Order could not be saved.')
  expect(onRefresh).toHaveBeenCalledTimes(2)
})

test('drop persistence uses the captured drag token, not a newer page snapshot', async () => {
  const api = createTestApi()
  vi.stubGlobal('api', api)
  api.collections.placeSample.mockResolvedValueOnce({ ok: true, data: saved })
  const onMoved = vi.fn()
  const currentPage = { ...page, collectionOrderToken: 'c'.repeat(64) }
  const { result } = renderHook(() =>
    useMoveCollectionSample({
      collectionId,
      page: currentPage,
      enabled: true,
      loading: false,
      pageError: null,
      onMoved,
      onRefresh: vi.fn(),
    }),
  )
  await act(async () =>
    result.current.place(
      sample,
      '33333333-3333-4333-8333-333333333333',
      'after',
      page.collectionOrderToken!,
    ),
  )
  expect(api.collections.placeSample).toHaveBeenCalledWith({
    collectionId,
    sampleId: sample.id,
    targetSampleId: '33333333-3333-4333-8333-333333333333',
    placement: 'after',
    token: page.collectionOrderToken,
  })
  expect(api.collections.moveSample).not.toHaveBeenCalled()
  expect(onMoved).toHaveBeenCalledWith(saved)
})

test('filtered, loading, failed and tokenless pages cannot issue a move', async () => {
  const api = createTestApi()
  vi.stubGlobal('api', api)
  const initialProps: {
    enabled: boolean
    loading: boolean
    pageError: string | null
    currentPage: LibraryPage
  } = { enabled: false, loading: false, pageError: null, currentPage: page }
  const { result, rerender } = renderHook(
    ({ currentPage, ...state }) =>
      useMoveCollectionSample({
        ...state,
        collectionId,
        page: currentPage,
        onMoved: vi.fn(),
        onRefresh: vi.fn(),
      }),
    { initialProps },
  )
  await act(async () => result.current.move(sample, 'down'))
  rerender({ ...initialProps, enabled: true, loading: true })
  await act(async () => result.current.move(sample, 'down'))
  rerender({ ...initialProps, enabled: true, pageError: 'Refresh failed.' })
  await act(async () => result.current.move(sample, 'down'))
  rerender({
    ...initialProps,
    enabled: true,
    currentPage: { ...page, collectionOrderToken: undefined },
  })
  await act(async () => result.current.move(sample, 'down'))
  expect(api.collections.moveSample).not.toHaveBeenCalled()
})

test('exit waits for successful persistence, while unmounted moves cannot refresh another view', async () => {
  const api = createTestApi()
  vi.stubGlobal('api', api)
  const pending = deferred<IpcResult<CollectionMoveResult>>()
  api.collections.moveSample.mockReturnValueOnce(pending.promise)
  const close = vi.spyOn(window, 'close').mockImplementation(() => {})
  const onMoved = vi.fn()
  const onRefresh = vi.fn()
  const { result, unmount } = renderHook(() =>
    useMoveCollectionSample({
      collectionId,
      page,
      enabled: true,
      loading: false,
      pageError: null,
      onMoved,
      onRefresh,
    }),
  )
  act(() => {
    void result.current.move(sample, 'down')
  })
  act(() => api.lifecycle.onCloseRequested.mock.calls.at(-1)![0]())
  expect(close).not.toHaveBeenCalled()
  unmount()
  await act(async () => pending.resolve({ ok: true, data: saved }))
  expect(close).not.toHaveBeenCalled()
  expect(onMoved).not.toHaveBeenCalled()
  expect(onRefresh).not.toHaveBeenCalled()
  const unload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(unload)
  expect(unload.defaultPrevented).toBe(false)
  close.mockRestore()
})

test('native exit completes only after a saved move and remains blocked by a failed move', async () => {
  const api = createTestApi()
  vi.stubGlobal('api', api)
  const first = deferred<IpcResult<CollectionMoveResult>>()
  const second = deferred<IpcResult<CollectionMoveResult>>()
  api.collections.moveSample
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise)
  const close = vi.spyOn(window, 'close').mockImplementation(() => {})
  const onRefresh = vi.fn()
  const { result, rerender } = renderHook(
    ({ currentPage }) =>
      useMoveCollectionSample({
        collectionId,
        page: currentPage,
        enabled: true,
        loading: false,
        pageError: null,
        onMoved: vi.fn(),
        onRefresh,
      }),
    { initialProps: { currentPage: page } },
  )
  act(() => {
    void result.current.move(sample, 'down')
  })
  act(() => api.lifecycle.onCloseRequested.mock.calls.at(-1)![0]())
  expect(close).not.toHaveBeenCalled()
  await act(async () => first.resolve({ ok: true, data: saved }))
  expect(close).toHaveBeenCalledOnce()
  close.mockClear()
  // A different dirty workflow could prevent that close; a later move must guard exit again.
  rerender({ currentPage: { ...page, collectionOrderToken: saved.orderToken } })
  act(() => {
    void result.current.move(sample, 'up')
  })
  const unload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(unload)
  expect(unload.defaultPrevented).toBe(true)
  act(() => api.lifecycle.onCloseRequested.mock.calls.at(-1)![0]())
  await act(async () =>
    second.resolve({
      ok: false,
      error: { code: 'STORAGE_FAILED', message: 'Order could not be saved.' },
    }),
  )
  expect(close).not.toHaveBeenCalled()
  expect(onRefresh).toHaveBeenCalledOnce()
  expect(result.current.error).toBe('Order could not be saved.')
  close.mockRestore()
})
