import { StrictMode, useRef, useState } from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { Dialog } from './Dialog'

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement): void {
      this.setAttribute('open', '')
      const target = this.querySelector<HTMLElement>('input, button') ?? this
      target.focus()
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

function Example(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open form</button>
      <Dialog
        open={open}
        aria-labelledby="form-title"
        onDismiss={() => setOpen(false)}
      >
        <h2 id="form-title">Example form</h2>
        <label>
          Name
          <input />
        </label>
      </Dialog>
    </>
  )
}

test('Dialog opens with an accessible title, closes through controlled state and restores opener focus on reopen and unmount', async () => {
  const user = userEvent.setup()
  const { unmount } = render(<Example />)
  const opener = screen.getByRole('button', { name: 'Open form' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(opener)
  expect(screen.getByRole('dialog', { name: 'Example form' })).toBeVisible()
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(opener).toHaveFocus()
  await user.click(opener)
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus()
  unmount()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('Dialog requests dismissal without hiding a protected form, including repeated Escape and native cancel', async () => {
  const user = userEvent.setup()
  const onDismiss = vi.fn()
  const outer = vi.fn()
  render(
    <div onKeyDown={outer}>
      <Dialog open aria-label="Protected form" onDismiss={onDismiss}>
        <label>
          Name
          <input defaultValue="Draft" />
        </label>
      </Dialog>
    </div>,
  )
  await user.keyboard('{Escape}{Escape}{Escape}{Escape}')
  const dialog = screen.getByRole('dialog', { name: 'Protected form' })
  expect(dialog).toBeVisible()
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Draft')
  expect(onDismiss).toHaveBeenCalledTimes(4)
  expect(outer).not.toHaveBeenCalled()
  const cancel = new Event('cancel', { bubbles: true, cancelable: true })
  fireEvent(dialog, cancel)
  expect(cancel.defaultPrevented).toBe(true)
  expect(onDismiss).toHaveBeenCalledTimes(5)
  expect(dialog).toBeVisible()
})

test('Dialog ignores backdrop interaction and does not treat content clicks as dismissal', async () => {
  const user = userEvent.setup()
  const onDismiss = vi.fn()
  render(
    <Dialog open aria-label="Form" onDismiss={onDismiss}>
      <button>Inside form</button>
    </Dialog>,
  )
  const dialog = screen.getByRole('dialog', { name: 'Form' })
  await user.click(dialog)
  await user.click(screen.getByRole('button', { name: 'Inside form' }))
  expect(dialog).toBeVisible()
  expect(onDismiss).not.toHaveBeenCalled()
})

function FocusExample({
  onDismiss,
}: {
  onDismiss: () => void
}): React.JSX.Element {
  const focus = useRef<HTMLInputElement>(null)
  return (
    <Dialog
      open
      aria-label="Focus form"
      onDismiss={onDismiss}
      initialFocus={focus}
    >
      <label>
        First
        <input />
      </label>
      <label>
        Preferred
        <input ref={focus} />
      </label>
    </Dialog>
  )
}

test('Dialog supports explicit initial focus and does not reopen or steal focus when callbacks change', async () => {
  const user = userEvent.setup()
  const firstDismiss = vi.fn()
  const nextDismiss = vi.fn()
  const { rerender } = render(<FocusExample onDismiss={firstDismiss} />)
  expect(screen.getByRole('textbox', { name: 'Preferred' })).toHaveFocus()
  const first = screen.getByRole('textbox', { name: 'First' })
  await user.click(first)
  await user.type(first, 'Keep this draft')
  rerender(<FocusExample onDismiss={nextDismiss} />)
  expect(first).toHaveFocus()
  expect(first).toHaveValue('Keep this draft')
  await user.keyboard('{Escape}')
  expect(firstDismiss).not.toHaveBeenCalled()
  expect(nextDismiss).toHaveBeenCalledOnce()
})

test('Dialog respects Escape consumed by an inner control or its keyboard handler', async () => {
  const user = userEvent.setup()
  const onDismiss = vi.fn()
  const { rerender } = render(
    <Dialog open aria-label="Form" onDismiss={onDismiss}>
      <input
        aria-label="Inner control"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
          }
        }}
      />
    </Dialog>,
  )
  await user.keyboard('{Escape}')
  expect(onDismiss).not.toHaveBeenCalled()
  rerender(
    <Dialog
      open
      aria-label="Form"
      onDismiss={onDismiss}
      onKeyDown={(event) => event.preventDefault()}
    >
      <input aria-label="Inner control" />
    </Dialog>,
  )
  await user.keyboard('{Escape}')
  expect(onDismiss).not.toHaveBeenCalled()
})

function NestedExample(): React.JSX.Element {
  const [parent, setParent] = useState(false)
  const [child, setChild] = useState(false)
  return (
    <>
      <button onClick={() => setParent(true)}>Open parent</button>
      <Dialog
        open={parent}
        aria-label="Parent form"
        onDismiss={() => setParent(false)}
      >
        <button onClick={() => setChild(true)}>Open child</button>
        <Dialog
          open={child}
          aria-label="Child form"
          onDismiss={() => setChild(false)}
        >
          <input aria-label="Child name" />
        </Dialog>
      </Dialog>
    </>
  )
}

test('nested Dialogs dismiss only the innermost surface and restore focus to the parent control', async () => {
  const user = userEvent.setup()
  render(<NestedExample />)
  await user.click(screen.getByRole('button', { name: 'Open parent' }))
  const parent = screen.getByRole('dialog', { name: 'Parent form' })
  const childOpener = within(parent).getByRole('button', { name: 'Open child' })
  await user.click(childOpener)
  expect(screen.getByRole('textbox', { name: 'Child name' })).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(
    screen.queryByRole('dialog', { name: 'Child form' }),
  ).not.toBeInTheDocument()
  expect(parent).toBeVisible()
  expect(childOpener).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Open parent' })).toHaveFocus()
})

test('Dialog remains controlled through StrictMode effect replay', async () => {
  const user = userEvent.setup()
  render(
    <StrictMode>
      <Example />
    </StrictMode>,
  )
  await user.click(screen.getByRole('button', { name: 'Open form' }))
  expect(screen.getByRole('dialog', { name: 'Example form' })).toBeVisible()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Open form' })).toHaveFocus()
})

test('unmounting an open Dialog restores a surviving opener and leaves no modal content', () => {
  const opener = document.createElement('button')
  opener.textContent = 'Surviving opener'
  document.body.append(opener)
  try {
    opener.focus()
    const { unmount } = render(
      <Dialog open aria-label="Temporary form" onDismiss={() => {}}>
        <input aria-label="Temporary name" />
      </Dialog>,
    )
    expect(
      screen.getByRole('textbox', { name: 'Temporary name' }),
    ).toHaveFocus()
    unmount()
    expect(opener).toHaveFocus()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  } finally {
    opener.remove()
  }
})
