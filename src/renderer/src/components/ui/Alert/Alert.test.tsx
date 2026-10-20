import { useState } from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { Alert } from './Alert'

beforeEach(() => {
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
})
afterEach(() => {
  cleanup()
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
})

test('Alert has two explicit actions, describes the decision, focuses cancel and restores its opener', async () => {
  const user = userEvent.setup()
  const confirm = vi.fn()
  function Example(): React.JSX.Element {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button onClick={() => setOpen(true)}>Review</button>
        <Alert
          open={open}
          title="Confirm action?"
          description="Only this grouping will change."
          confirmLabel="Confirm"
          onConfirm={confirm}
          onCancel={() => setOpen(false)}
        />
      </>
    )
  }
  render(<Example />)
  const opener = screen.getByRole('button', { name: 'Review' })
  await user.click(opener)
  const alert = screen.getByRole('alertdialog', { name: 'Confirm action?' })
  expect(alert).toHaveAccessibleDescription('Only this grouping will change.')
  expect(within(alert).getAllByRole('button')).toHaveLength(2)
  expect(within(alert).getByRole('button', { name: 'Cancel' })).toHaveFocus()
  await user.click(within(alert).getByRole('button', { name: 'Confirm' }))
  expect(confirm).toHaveBeenCalledOnce()
  expect(alert).toBeVisible()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(opener).toHaveFocus()
})

test('Alert blocks actions and Escape while pending and ignores backdrop clicks', async () => {
  const user = userEvent.setup()
  const confirm = vi.fn()
  const cancel = vi.fn()
  const props = {
    open: true,
    title: 'Confirm?',
    description: 'Review first.',
    confirmLabel: 'Continue',
    onConfirm: confirm,
    onCancel: cancel,
  }
  const { rerender } = render(<Alert {...props} pending />)
  const alert = screen.getByRole('alertdialog')
  expect(alert).toHaveAttribute('aria-busy', 'true')
  for (const button of within(alert).getAllByRole('button')) {
    expect(button).toBeDisabled()
    await user.click(button)
  }
  await user.keyboard('{Escape}')
  fireEvent(alert, new Event('cancel', { bubbles: true, cancelable: true }))
  expect(cancel).not.toHaveBeenCalled()
  expect(confirm).not.toHaveBeenCalled()
  rerender(<Alert {...props} confirmDisabled />)
  await user.click(alert)
  expect(cancel).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(cancel).toHaveBeenCalledOnce()
})
