import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { useCheckedCollectionSamples } from './useCheckedCollectionSamples'
import { createTestApi } from '../../../../../../../tests/support/ui/bridge'
import { makeAudioSample } from '../../../../../../../tests/support/fixtures/audio-sample'
import { deferred } from '../../../../../../../tests/support/fixtures/deferred'
import type { IpcResult } from '@shared/ipc/result'
import type { LibraryPage } from '@shared/ipc/library'

function makeSamples(count: number): LibraryPage['items'] {
  return Array.from({ length: count }, (_, index) => ({
    ...makeAudioSample({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    }),
    rootPath: '/fixtures',
    sourceRevision: 1,
    audioUrl: null,
    unavailableReason: 'Audio unavailable.',
  }))
}

test('reviews all checked identities with bounded pages in source order and identifies missing catalog entries', async () => {
  const samples = makeSamples(102)
  const api = createTestApi()
  vi.stubGlobal('api', api)
  api.library.list.mockImplementation(async (request) => ({
    ok: true,
    data: {
      items: samples
        .slice(0, 101)
        .slice(request?.offset ?? 0, (request?.offset ?? 0) + 100),
      total: 101,
      limit: 100,
      offset: request?.offset ?? 0,
    },
  }))
  const { result } = renderHook(() => useCheckedCollectionSamples(samples))
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.samples.map(({ id }) => id)).toEqual(
    samples.slice(0, 101).map(({ id }) => id),
  )
  expect(result.current.missing).toEqual([samples[101]])
  expect(
    api.library.list.mock.calls.map(([request]) => request?.offset),
  ).toEqual([0, 100])
})

test('a changed Collection order blocks the whole review until explicitly retried', async () => {
  const samples = makeSamples(101)
  const api = createTestApi()
  vi.stubGlobal('api', api)
  let changed = true
  api.library.list.mockImplementation(async (request) => ({
    ok: true,
    data: {
      items: samples.slice(request?.offset ?? 0, (request?.offset ?? 0) + 100),
      total: 101,
      limit: 100,
      offset: request?.offset ?? 0,
      collectionOrderToken: (changed && request?.offset ? 'b' : 'a').repeat(64),
    },
  }))
  const collectionId = '11111111-1111-4111-8111-111111111111'
  const { result } = renderHook(() =>
    useCheckedCollectionSamples(samples, collectionId),
  )
  await waitFor(() =>
    expect(result.current.error).toContain('source Collection changed'),
  )
  expect(result.current.samples).toEqual([])
  changed = false
  act(() => result.current.refresh())
  await waitFor(() => expect(result.current.samples).toHaveLength(101))
  expect(result.current.error).toBeNull()
  expect(api.library.list).toHaveBeenLastCalledWith({
    sampleIds: samples.map(({ id }) => id),
    collectionId,
    limit: 100,
    offset: 100,
  })
})

test('stale review completions cannot replace a newer selection and failed reads expose retry without saved writes', async () => {
  const samples = makeSamples(2)
  const api = createTestApi()
  vi.stubGlobal('api', api)
  const pending = deferred<IpcResult<LibraryPage>>()
  api.library.list.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({
    ok: false,
    error: { code: 'STORAGE_FAILED', message: 'Review failed.' },
  })
  const { result, rerender } = renderHook(
    ({ scope }) => useCheckedCollectionSamples(scope),
    { initialProps: { scope: samples } },
  )
  rerender({ scope: [samples[1]] })
  await waitFor(() => expect(result.current.error).toBe('Review failed.'))
  await act(async () =>
    pending.resolve({
      ok: true,
      data: { items: samples, total: 2, limit: 100, offset: 0 },
    }),
  )
  expect(result.current.error).toBe('Review failed.')
  expect(result.current.samples).toEqual([])
  expect(api.collections.setMembership).not.toHaveBeenCalled()
})
