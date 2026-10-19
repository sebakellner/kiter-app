import { useRef, useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import { Popover } from './Popover'

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
    },
  )
})

function Example({
  protect = false,
}: {
  protect?: boolean
}): React.JSX.Element {
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button ref={anchor} onClick={() => setOpen(true)}>
        Open
      </button>
      <button>Outside</button>
      <Popover
        open={open}
        anchor={anchor}
        onDismiss={() => setOpen(false)}
        dismissOnOutside={!protect}
      >
        <button>Inside</button>
      </Popover>
    </>
  )
}

test('non-modal Popover dismisses on outside interaction without stealing focus', async () => {
  const user = userEvent.setup()
  render(<Example />)
  await user.click(screen.getByRole('button', { name: 'Open' }))
  expect(screen.getByRole('button', { name: 'Inside' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Outside' }))
  expect(
    screen.queryByRole('button', { name: 'Inside' }),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Outside' })).toHaveFocus()
})

test('outside dismissal can be disabled and Escape consumes only its own layer', async () => {
  const user = userEvent.setup()
  const outer = vi.fn()
  render(
    <div onKeyDown={outer}>
      <Example protect />
    </div>,
  )
  await user.click(screen.getByRole('button', { name: 'Open' }))
  await user.click(screen.getByRole('button', { name: 'Outside' }))
  expect(screen.getByRole('button', { name: 'Inside' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Inside' }))
  await user.keyboard('{Escape}')
  expect(
    screen.queryByRole('button', { name: 'Inside' }),
  ).not.toBeInTheDocument()
  expect(outer).not.toHaveBeenCalled()
})

function NestedExample(): React.JSX.Element {
  const outerAnchor = useRef<HTMLButtonElement>(null)
  const innerAnchor = useRef<HTMLButtonElement>(null)
  const [outer, setOuter] = useState(false)
  const [inner, setInner] = useState(false)
  return (
    <>
      <button ref={outerAnchor} onClick={() => setOuter(true)}>
        Open parent
      </button>
      <Popover
        open={outer}
        anchor={outerAnchor}
        onDismiss={() => setOuter(false)}
      >
        <button ref={innerAnchor} onClick={() => setInner(true)}>
          Open child
        </button>
        <Popover
          open={inner}
          anchor={innerAnchor}
          onDismiss={() => setInner(false)}
        >
          <button>Child content</button>
        </Popover>
      </Popover>
    </>
  )
}

test('nested popovers close the innermost layer first without cascading', async () => {
  const user = userEvent.setup()
  render(<NestedExample />)
  await user.click(screen.getByRole('button', { name: 'Open parent' }))
  await user.click(screen.getByRole('button', { name: 'Open child' }))
  await user.click(screen.getByRole('button', { name: 'Child content' }))
  await user.keyboard('{Escape}')
  expect(
    screen.queryByRole('button', { name: 'Child content' }),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Open child' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Open child' }))
  await user.keyboard('{Escape}')
  expect(
    screen.queryByRole('button', { name: 'Child content' }),
  ).not.toBeInTheDocument()
  await user.keyboard('{Escape}')
  expect(
    screen.queryByRole('button', { name: 'Open child' }),
  ).not.toBeInTheDocument()
})
