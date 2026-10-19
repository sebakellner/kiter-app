import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import { ContextMenu } from './ContextMenu'
import { useContextMenu } from './useContextMenu'
import type { ContextMenuItem } from './ContextMenu.types'

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
  label = 'Example',
  items,
}: {
  label?: string
  items: ContextMenuItem[]
}): React.JSX.Element {
  const menu = useContextMenu()
  return (
    <>
      <div
        role="group"
        aria-label={label}
        tabIndex={0}
        onContextMenu={menu.onContextMenu}
        onKeyDown={menu.onKeyDown}
        onClick={menu.onClick}
      >
        <button {...menu.triggerProps}>More {label} actions</button>
      </div>
      <button>Outside {label}</button>
      <ContextMenu
        {...menu.menuProps}
        label={`${label} actions`}
        items={items}
      />
    </>
  )
}

function makeItems(onSelect = vi.fn()): ContextMenuItem[] {
  return [
    { id: 'disabled', label: 'Unavailable', disabled: true, onSelect },
    { id: 'play', label: 'Play', onSelect },
    { id: 'info', label: 'Info', onSelect },
    { id: 'pin', label: 'Pin', onSelect },
  ]
}

test('ContextMenu exposes the same actions from its button and a right-click without executing them', async () => {
  const user = userEvent.setup()
  const onSelect = vi.fn()
  render(<Example items={makeItems(onSelect)} />)
  const button = screen.getByRole('button', { name: 'More Example actions' })
  await user.click(button)
  const menu = screen.getByRole('menu', { name: 'Example actions' })
  expect(button).toHaveAttribute('aria-expanded', 'true')
  expect(button).toHaveAttribute('aria-controls', menu.id)
  expect(screen.getByRole('menuitem', { name: 'Play' })).toHaveFocus()
  const names = screen.getAllByRole('menuitem').map((item) => item.textContent)
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(button).toHaveFocus()
  const target = screen.getByRole('group', { name: 'Example' })
  const event = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: 120,
    clientY: 180,
  })
  fireEvent(target, event)
  expect(event.defaultPrevented).toBe(true)
  expect(
    screen.getAllByRole('menuitem').map((item) => item.textContent),
  ).toEqual(names)
  expect(onSelect).not.toHaveBeenCalled()
  await user.keyboard('{Escape}')
  expect(target).toHaveFocus()
})

test('ContextMenu supports arrows, Home, End and typeahead while skipping disabled actions', async () => {
  const user = userEvent.setup()
  render(<Example items={makeItems()} />)
  const trigger = screen.getByRole('button', { name: 'More Example actions' })
  trigger.focus()
  await user.keyboard('{ArrowUp}')
  expect(screen.getByRole('menuitem', { name: 'Pin' })).toHaveFocus()
  await user.keyboard('{ArrowDown}')
  expect(screen.getByRole('menuitem', { name: 'Play' })).toHaveFocus()
  await user.keyboard('{ArrowDown}')
  expect(screen.getByRole('menuitem', { name: 'Info' })).toHaveFocus()
  await user.keyboard('{End}')
  expect(screen.getByRole('menuitem', { name: 'Pin' })).toHaveFocus()
  await user.keyboard('{Home}')
  expect(screen.getByRole('menuitem', { name: 'Play' })).toHaveFocus()
  await user.keyboard('i')
  expect(screen.getByRole('menuitem', { name: 'Info' })).toHaveFocus()
})

test('ContextMenu activates actions with Enter or Space, closes and returns the stable opener', async () => {
  const user = userEvent.setup()
  const onSelect = vi.fn()
  render(<Example items={makeItems(onSelect)} />)
  const trigger = screen.getByRole('button', { name: 'More Example actions' })
  await user.click(trigger)
  await user.keyboard('{Enter}')
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(trigger)
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
  await user.keyboard('{ArrowDown}')
  await user.keyboard(' ')
  expect(onSelect).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

test('ContextMenu dismisses outside without stealing focus, toggles its button and lets Tab leave the menu', async () => {
  const user = userEvent.setup()
  render(<Example items={makeItems()} />)
  const trigger = screen.getByRole('button', { name: 'More Example actions' })
  const outside = screen.getByRole('button', { name: 'Outside Example' })
  await user.click(trigger)
  await user.click(outside)
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(outside).toHaveFocus()
  await user.click(trigger)
  await user.click(trigger)
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  await user.click(trigger)
  await user.tab()
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(outside).toHaveFocus()
})

test('ContextMenu opens from keyboard context gestures and closes on external scroll, not menu scrolling', async () => {
  const user = userEvent.setup()
  render(<Example items={makeItems()} />)
  const target = screen.getByRole('group', { name: 'Example' })
  target.focus()
  await user.keyboard('{Shift>}{F10}{/Shift}')
  expect(screen.getByRole('menu', { name: 'Example actions' })).toBeVisible()
  fireEvent.scroll(screen.getByRole('menu'))
  expect(screen.getByRole('menu')).toBeVisible()
  fireEvent.scroll(document)
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  target.focus()
  fireEvent.keyDown(target, { key: 'ContextMenu' })
  expect(screen.getByRole('menu')).toBeVisible()
})

test('ContextMenu replaces a menu on another target and removes portals when its owner unmounts', async () => {
  const user = userEvent.setup()
  const { unmount } = render(
    <>
      <Example label="First" items={makeItems()} />
      <Example label="Second" items={makeItems()} />
    </>,
  )
  await user.click(screen.getByRole('button', { name: 'More First actions' }))
  const second = screen.getByRole('group', { name: 'Second' })
  fireEvent.pointerDown(second, { button: 2 })
  fireEvent.contextMenu(second, { clientX: 80, clientY: 90 })
  expect(screen.getAllByRole('menu')).toHaveLength(1)
  expect(screen.getByRole('menu', { name: 'Second actions' })).toBeVisible()
  unmount()
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})
