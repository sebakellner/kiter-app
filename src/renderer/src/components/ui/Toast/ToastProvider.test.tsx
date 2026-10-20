import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test } from 'vitest'
import { ToastProvider, useToast } from './index'

afterEach(cleanup)

test('the provider groups the same operation, retains independent results and dismisses one notice', async () => {
  const user = userEvent.setup()
  const { result } = renderHook(() => useToast(), { wrapper: ToastProvider })
  const showToast = result.current.showToast
  act(() => {
    showToast({ operationId: 'favorite:1', message: 'Added.' })
    showToast({ operationId: 'collection:1', message: 'Saved in Collection.' })
    showToast({ operationId: 'favorite:1', message: 'Removed.' })
  })
  expect(
    screen.getAllByRole('status').map((notice) => notice.textContent),
  ).toEqual(['Saved in Collection.', 'Removed.'])
  expect(result.current.showToast).toBe(showToast)
  await user.click(
    screen.getByRole('button', { name: 'Dismiss notification: Removed.' }),
  )
  expect(
    screen.getAllByRole('status').map((notice) => notice.textContent),
  ).toEqual(['Saved in Collection.'])
})

test('bounded notifications do not evict unresolved errors or erase them with later success', () => {
  const { result } = renderHook(() => useToast(), { wrapper: ToastProvider })
  act(() => {
    result.current.showToast({
      operationId: 'add',
      message: 'Failed.',
      variant: 'error',
    })
    for (let index = 0; index < 10; index++) {
      result.current.showToast({ message: `Success ${index}` })
    }
    result.current.showToast({
      operationId: 'add',
      message: 'Retry succeeded.',
    })
  })
  expect(screen.getByRole('alert')).toHaveTextContent('Failed.')
  expect(screen.getAllByRole('status')).toHaveLength(4)
  expect(screen.getAllByRole('status').at(-1)).toHaveTextContent(
    'Retry succeeded.',
  )
})

test('five unresolved errors reject additional independent notifications without hiding an error', () => {
  const { result } = renderHook(() => useToast(), { wrapper: ToastProvider })
  act(() => {
    for (let index = 0; index < 5; index++) {
      result.current.showToast({ message: `Error ${index}`, variant: 'error' })
    }
    result.current.showToast({ message: 'Cannot replace errors.' })
  })
  expect(screen.getAllByRole('alert')).toHaveLength(5)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(screen.queryByText('Cannot replace errors.')).not.toBeInTheDocument()
})

test('a repeated failure updates its operation without replacing independent errors', () => {
  const { result } = renderHook(() => useToast(), { wrapper: ToastProvider })
  act(() => {
    result.current.showToast({
      operationId: 'first',
      message: 'First failure.',
      variant: 'error',
    })
    result.current.showToast({
      operationId: 'second',
      message: 'Independent failure.',
      variant: 'error',
    })
    result.current.showToast({
      operationId: 'first',
      message: 'Retry failed.',
      variant: 'error',
    })
  })
  expect(
    screen.getAllByRole('alert').map((notice) => notice.textContent),
  ).toEqual(['Independent failure.', 'Retry failed.'])
})

test('the private viewport follows a native dialog and retains notices when the dialog closes', async () => {
  const user = userEvent.setup()
  function Publisher(): React.JSX.Element {
    const { showToast } = useToast()
    return (
      <button onClick={() => showToast({ message: 'Added to Collection.' })}>
        Show toast
      </button>
    )
  }
  render(
    <ToastProvider>
      <dialog aria-label="Picker">
        <Publisher />
      </dialog>
    </ToastProvider>,
  )
  const dialog = screen.getByRole('dialog', { hidden: true })
  act(() => {
    dialog.setAttribute('open', '')
  })
  await waitFor(() =>
    expect(
      within(dialog).getByRole('region', { name: 'Notifications' }),
    ).toBeInTheDocument(),
  )
  await user.click(within(dialog).getByRole('button', { name: 'Show toast' }))
  expect(within(dialog).getByRole('status')).toHaveTextContent(
    'Added to Collection.',
  )
  act(() => {
    dialog.removeAttribute('open')
  })
  await waitFor(() =>
    expect(
      screen.getByRole('region', { name: 'Notifications' }).parentElement,
    ).toBe(document.body),
  )
  expect(screen.getAllByRole('region', { name: 'Notifications' })).toHaveLength(
    1,
  )
  expect(screen.getByRole('status')).toHaveTextContent('Added to Collection.')
})

test('provider state and late callbacks do not leak into a new provider after unmount', () => {
  const first = renderHook(() => useToast(), { wrapper: ToastProvider })
  const previousShowToast = first.result.current.showToast
  act(() => previousShowToast({ message: 'Old result.', variant: 'error' }))
  first.unmount()
  const second = renderHook(() => useToast(), { wrapper: ToastProvider })
  act(() => {
    previousShowToast({ message: 'Late old result.' })
    second.result.current.showToast({ message: 'New result.' })
  })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getAllByRole('status')).toHaveLength(1)
  expect(screen.getByRole('status')).toHaveTextContent('New result.')
})

test('useToast requires an explicit provider instead of falling back to global state', () => {
  expect(() => renderHook(() => useToast())).toThrow(
    'useToast must be used within ToastProvider.',
  )
})
