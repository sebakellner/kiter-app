import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { InstrumentEditor } from './InstrumentEditor'
import { ClassificationEditor } from '../ClassificationEditor/ClassificationEditor'
import { SampleTypeEditor } from '../SampleTypeEditor/SampleTypeEditor'
import { createTestApi } from '../../../../../../../tests/support/ui/bridge'

const kick = { id: '00000000-0000-4000-8000-000000000001', name: 'Kick' }
const snare = { id: '00000000-0000-4000-8000-000000000002', name: 'Snare' }

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
})

function setup(
  dimension: 'instrument' | 'genre' | 'sample-type' = 'instrument',
): {
  api: ReturnType<typeof createTestApi>
  onClose: ReturnType<typeof vi.fn>
  onSaved: ReturnType<typeof vi.fn>
  user: ReturnType<typeof userEvent.setup>
} {
  const api = createTestApi()
  vi.stubGlobal('api', api)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
    },
  )
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement): void {
      this.setAttribute('open', '')
    },
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement): void {
      this.removeAttribute('open')
    },
  })
  api.instruments.readSample.mockResolvedValue({
    ok: true,
    data: { sampleId: 'sample', token: 'a'.repeat(64), instruments: [kick] },
  })
  api.instruments.list.mockResolvedValue({
    ok: true,
    data: { items: [kick, snare], total: 2, limit: 50, offset: 0 },
  })
  api.genres.readSample.mockResolvedValue({
    ok: true,
    data: { sampleId: 'sample', token: 'a'.repeat(64), genres: [kick] },
  })
  api.genres.list.mockResolvedValue({
    ok: true,
    data: { items: [kick, snare], total: 2, limit: 50, offset: 0 },
  })
  const onClose = vi.fn()
  const onSaved = vi.fn()
  api.classification.readSampleType.mockResolvedValue({
    ok: true,
    data: { sampleId: 'sample', token: 'a'.repeat(64), sampleType: 'loop' },
  })
  render(
    dimension === 'instrument' ? (
      <InstrumentEditor
        sampleId="sample"
        anchor={document.body}
        onClose={onClose}
        onSaved={onSaved}
      />
    ) : dimension === 'genre' ? (
      <ClassificationEditor
        dimension="genre"
        sampleId="sample"
        anchor={document.body}
        onClose={onClose}
        onSaved={onSaved}
      />
    ) : (
      <SampleTypeEditor
        sampleId="sample"
        anchor={document.body}
        onClose={onClose}
        onSaved={onSaved}
      />
    ),
  )
  return { api, onClose, onSaved, user: userEvent.setup() }
}

test('single Sample type draft protects cancellation and preserves stale choices through reload', async () => {
  const { api, onClose, onSaved, user } = setup('sample-type')
  api.classification.saveSampleType
    .mockResolvedValueOnce({
      ok: false,
      error: { code: 'STALE_REVIEW', message: 'Saved Sample type changed.' },
    })
    .mockResolvedValueOnce({
      ok: true,
      data: { sampleId: 'sample', token: 'c'.repeat(64), sampleType: 'loop' },
    })
  const select = await screen.findByRole('combobox', { name: 'Sample type' })
  expect(select).toHaveValue('loop')
  await user.selectOptions(select, 'one-shot')
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onClose).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Stay' }))
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Saved Sample type changed.',
  )
  expect(select).toHaveValue('one-shot')
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  api.classification.readSampleType.mockResolvedValueOnce({
    ok: true,
    data: { sampleId: 'sample', token: 'b'.repeat(64), sampleType: 'unknown' },
  })
  await user.click(screen.getByRole('button', { name: 'Reload saved type' }))
  expect(select).toHaveValue('one-shot')
  await user.selectOptions(select, 'loop')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(api.classification.saveSampleType).toHaveBeenLastCalledWith({
    sampleId: 'sample',
    token: 'b'.repeat(64),
    sampleType: 'loop',
  })
  expect(onSaved).toHaveBeenCalledOnce()
})

test('genre selection uses its own save contract and preserves a stale draft through reload', async () => {
  const { api, onClose, onSaved, user } = setup('genre')
  api.genres.saveSample
    .mockResolvedValueOnce({
      ok: false,
      error: { code: 'STALE_REVIEW', message: 'Saved genres changed.' },
    })
    .mockResolvedValueOnce({
      ok: true,
      data: { sampleId: 'sample', token: 'c'.repeat(64), genres: [snare] },
    })
  await user.click(await screen.findByRole('checkbox', { name: 'Kick' }))
  await user.click(screen.getByRole('checkbox', { name: 'Snare' }))
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  await user.click(screen.getByRole('button', { name: 'Stay' }))
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Saved genres changed.',
  )
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  api.genres.readSample.mockResolvedValueOnce({
    ok: true,
    data: { sampleId: 'sample', token: 'b'.repeat(64), genres: [] },
  })
  await user.click(screen.getByRole('button', { name: 'Reload saved genres' }))
  expect(screen.getByRole('checkbox', { name: 'Snare' })).toBeChecked()
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(api.genres.saveSample).toHaveBeenLastCalledWith({
    sampleId: 'sample',
    token: 'b'.repeat(64),
    genreIds: [snare.id],
  })
  expect(onSaved).toHaveBeenCalledOnce()
  expect(onClose).toHaveBeenCalledOnce()
  expect(api.instruments.saveSample).not.toHaveBeenCalled()
})

test('instrument changes remain a draft until an atomic save succeeds', async () => {
  const { api, onClose, onSaved, user } = setup()
  api.instruments.saveSample.mockResolvedValue({
    ok: true,
    data: { sampleId: 'sample', token: 'b'.repeat(64), instruments: [snare] },
  })
  await user.click(await screen.findByRole('checkbox', { name: 'Kick' }))
  await user.click(screen.getByRole('checkbox', { name: 'Snare' }))
  expect(api.instruments.saveSample).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(api.instruments.saveSample).toHaveBeenCalledWith({
    sampleId: 'sample',
    token: 'a'.repeat(64),
    instrumentIds: [snare.id],
  })
  expect(onSaved).toHaveBeenCalledOnce()
  expect(onClose).toHaveBeenCalledOnce()
})

test('cancel protects dirty choices and discard performs no writes', async () => {
  const { api, onClose, user } = setup()
  await user.click(await screen.findByRole('checkbox', { name: 'Snare' }))
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onClose).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Stay' }))
  expect(screen.getByRole('checkbox', { name: 'Snare' })).toBeChecked()
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  await user.click(screen.getByRole('button', { name: 'Discard changes' }))
  expect(onClose).toHaveBeenCalledOnce()
  expect(api.instruments.saveSample).not.toHaveBeenCalled()
})

test('restoring the saved selection clears form dirty state regardless of selection order', async () => {
  const { api, onClose, user } = setup()
  await user.click(await screen.findByRole('checkbox', { name: 'Snare' }))
  await user.click(screen.getByRole('checkbox', { name: 'Kick' }))
  await user.click(screen.getByRole('checkbox', { name: 'Kick' }))
  await user.click(screen.getByRole('checkbox', { name: 'Snare' }))
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onClose).toHaveBeenCalledOnce()
  expect(api.instruments.saveSample).not.toHaveBeenCalled()
})

test('a stale save preserves edits and requires reloading current assignments before retry', async () => {
  const { api, onClose, user } = setup()
  api.instruments.saveSample.mockResolvedValueOnce({
    ok: false,
    error: { code: 'STALE_REVIEW', message: 'Saved instruments changed.' },
  })
  await user.click(await screen.findByRole('checkbox', { name: 'Snare' }))
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Saved instruments changed.',
  )
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  expect(onClose).not.toHaveBeenCalled()
  api.instruments.readSample.mockResolvedValueOnce({
    ok: true,
    data: { sampleId: 'sample', token: 'c'.repeat(64), instruments: [] },
  })
  await user.click(
    screen.getByRole('button', { name: 'Reload saved instruments' }),
  )
  expect(await screen.findByRole('button', { name: 'Save' })).toBeEnabled()
  expect(
    within(
      screen.getByRole('list', { name: 'Selected instruments' }),
    ).getByText('Snare'),
  ).toBeVisible()
})
