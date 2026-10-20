import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { Toast } from './Toast'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

test('Toast announces success without taking focus and expires after five seconds', () => {
  vi.useFakeTimers()
  const dismiss = vi.fn()
  render(
    <>
      <button autoFocus>Keep focus</button>
      <Toast message="Sample added." onDismiss={dismiss} />
    </>,
  )
  expect(screen.getByRole('button', { name: 'Keep focus' })).toHaveFocus()
  expect(screen.getByRole('status')).toHaveTextContent('Sample added.')
  act(() => {
    vi.advanceTimersByTime(4999)
  })
  expect(dismiss).not.toHaveBeenCalled()
  act(() => {
    vi.advanceTimersByTime(1)
  })
  expect(dismiss).toHaveBeenCalledOnce()
})

test('Toast preserves remaining time while either hovered or focused', () => {
  vi.useFakeTimers()
  const dismiss = vi.fn()
  render(
    <>
      <button>Outside</button>
      <Toast message="Saved." onDismiss={dismiss} />
    </>,
  )
  act(() => {
    vi.advanceTimersByTime(2000)
  })
  const close = screen.getByRole('button', {
    name: 'Dismiss notification: Saved.',
  })
  fireEvent.mouseEnter(close)
  act(() => {
    close.focus()
  })
  act(() => {
    vi.advanceTimersByTime(10000)
  })
  fireEvent.mouseLeave(close)
  act(() => {
    vi.advanceTimersByTime(10000)
  })
  expect(dismiss).not.toHaveBeenCalled()
  act(() => {
    screen.getByRole('button', { name: 'Outside' }).focus()
  })
  act(() => {
    vi.advanceTimersByTime(2999)
  })
  expect(dismiss).not.toHaveBeenCalled()
  act(() => {
    vi.advanceTimersByTime(1)
  })
  expect(dismiss).toHaveBeenCalledOnce()
})

test('Toast errors never expire, dismiss manually and consume Escape without closing a parent', async () => {
  vi.useFakeTimers()
  const user = userEvent.setup()
  const dismiss = vi.fn()
  const parent = vi.fn()
  const { unmount } = render(
    <div onKeyDown={parent}>
      <Toast
        variant="error"
        message="One destination failed."
        onDismiss={dismiss}
      />
    </div>,
  )
  expect(screen.getByRole('alert')).toHaveTextContent('One destination failed.')
  act(() => {
    vi.advanceTimersByTime(60000)
  })
  expect(dismiss).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
  vi.useRealTimers()
  await user.click(screen.getByRole('button', { name: /Dismiss notification/ }))
  expect(dismiss).toHaveBeenCalledOnce()
  await user.keyboard('{Escape}')
  expect(dismiss).toHaveBeenCalledTimes(2)
  expect(parent).not.toHaveBeenCalled()
  unmount()
})

test('Toast keeps its timer across callback updates and clears it on unmount', () => {
  vi.useFakeTimers()
  const first = vi.fn()
  const latest = vi.fn()
  const view = render(<Toast message="Saved." onDismiss={first} />)
  act(() => {
    vi.advanceTimersByTime(2000)
  })
  view.rerender(<Toast message="Saved." onDismiss={latest} />)
  act(() => {
    vi.advanceTimersByTime(3000)
  })
  expect(first).not.toHaveBeenCalled()
  expect(latest).toHaveBeenCalledOnce()
  view.unmount()
  const next = render(<Toast message="Another result." onDismiss={first} />)
  expect(vi.getTimerCount()).toBe(1)
  next.unmount()
  expect(vi.getTimerCount()).toBe(0)
})
