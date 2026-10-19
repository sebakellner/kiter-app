import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { CategoryEditor } from './CategoryEditor'
import { createTestApi } from '../../../../../../../tests/support/ui/bridge'

const kick = { id: '00000000-0000-4000-8000-000000000001', name: 'Kick' }
const snare = { id: '00000000-0000-4000-8000-000000000002', name: 'Snare' }

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
})

function setup(): {
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
  api.categories.readSample.mockResolvedValue({
    ok: true,
    data: { sampleId: 'sample', token: 'a'.repeat(64), categories: [kick] },
  })
  api.categories.list.mockResolvedValue({
    ok: true,
    data: { items: [kick, snare], total: 2, limit: 50, offset: 0 },
  })
  const onClose = vi.fn()
  const onSaved = vi.fn()
  render(
    <CategoryEditor
      sampleId="sample"
      anchor={document.body}
      onClose={onClose}
      onSaved={onSaved}
    />,
  )
  return { api, onClose, onSaved, user: userEvent.setup() }
}

test('category changes remain a draft until an atomic save succeeds', async () => {
  const { api, onClose, onSaved, user } = setup()
  api.categories.saveSample.mockResolvedValue({
    ok: true,
    data: { sampleId: 'sample', token: 'b'.repeat(64), categories: [snare] },
  })
  await user.click(await screen.findByRole('checkbox', { name: 'Kick' }))
  await user.click(screen.getByRole('checkbox', { name: 'Snare' }))
  expect(api.categories.saveSample).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(api.categories.saveSample).toHaveBeenCalledWith({
    sampleId: 'sample',
    token: 'a'.repeat(64),
    categoryIds: [snare.id],
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
  expect(api.categories.saveSample).not.toHaveBeenCalled()
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
  expect(api.categories.saveSample).not.toHaveBeenCalled()
})

test('a stale save preserves edits and requires reloading current assignments before retry', async () => {
  const { api, onClose, user } = setup()
  api.categories.saveSample.mockResolvedValueOnce({
    ok: false,
    error: { code: 'STALE_REVIEW', message: 'Saved categories changed.' },
  })
  await user.click(await screen.findByRole('checkbox', { name: 'Snare' }))
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Saved categories changed.',
  )
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  expect(onClose).not.toHaveBeenCalled()
  api.categories.readSample.mockResolvedValueOnce({
    ok: true,
    data: { sampleId: 'sample', token: 'c'.repeat(64), categories: [] },
  })
  await user.click(
    screen.getByRole('button', { name: 'Reload saved categories' }),
  )
  expect(await screen.findByRole('button', { name: 'Save' })).toBeEnabled()
  expect(
    within(screen.getByRole('list', { name: 'Selected categories' })).getByText(
      'Snare',
    ),
  ).toBeVisible()
})
