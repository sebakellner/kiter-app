import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../Button'
import { Popover } from '../Popover'
import type { ContextMenuProps } from './ContextMenu.types'
import './ContextMenu.css'

export function ContextMenu({
  id,
  label,
  target,
  items,
  onDismiss,
}: ContextMenuProps): React.JSX.Element | null {
  const menu = useRef<HTMLDivElement>(null)
  const search = useRef({ text: '', time: 0 })

  useEffect(() => {
    if (!target || !menu.current) {
      return
    }
    const element = menu.current
    const buttons = element.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled)',
    )
    const initial =
      target.initialFocus === 'last' ? buttons[buttons.length - 1] : buttons[0]
    const focusTarget = initial ?? element
    focusTarget.focus({ preventScroll: true })
    search.current = { text: '', time: 0 }
    function onScroll(event: Event): void {
      if (!(event.target instanceof Node) || !element.contains(event.target)) {
        onDismiss('outside')
      }
    }
    document.addEventListener('scroll', onScroll, true)
    return () => document.removeEventListener('scroll', onScroll, true)
  }, [target, onDismiss])

  if (!target) {
    return null
  }

  return createPortal(
    <Popover
      open
      anchor={target.anchor}
      position={target.position}
      onDismiss={onDismiss}
      align="end"
      className="ui-context-menu"
      restoreFocus={false}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onDragStart={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <div
        id={id}
        role="menu"
        aria-label={label}
        ref={menu}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            return
          }
          event.stopPropagation()
          if (event.key === 'Tab') {
            onDismiss('tab')
            return
          }
          const buttons = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              '[role="menuitem"]:not(:disabled)',
            ),
          )
          if (
            !buttons.length ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey
          ) {
            return
          }
          const current = buttons.findIndex(
            (button) => button === document.activeElement,
          )
          let next: number | undefined
          if (event.key === 'ArrowDown') {
            next = (current + 1) % buttons.length
          } else if (event.key === 'ArrowUp') {
            next = current <= 0 ? buttons.length - 1 : current - 1
          } else if (event.key === 'Home') {
            next = 0
          } else if (event.key === 'End') {
            next = buttons.length - 1
          } else if (event.key.length === 1 && event.key !== ' ') {
            const now = Date.now()
            const previous =
              now - search.current.time < 500 ? search.current.text : ''
            const text =
              previous === event.key.toLowerCase()
                ? previous
                : previous + event.key.toLowerCase()
            search.current = { text, time: now }
            for (let offset = 1; offset <= buttons.length; offset++) {
              const index = (current + offset) % buttons.length
              if (
                buttons[index].textContent
                  ?.trim()
                  .toLowerCase()
                  .startsWith(text)
              ) {
                next = index
                break
              }
            }
          }
          if (next !== undefined) {
            event.preventDefault()
            buttons[next].focus()
          }
        }}
      >
        {items.map((item) => (
          <Button
            key={item.id}
            role="menuitem"
            tabIndex={-1}
            disabled={item.disabled}
            onClick={() => {
              onDismiss('select')
              item.onSelect(target.anchor)
            }}
          >
            {item.label}
          </Button>
        ))}
      </div>
    </Popover>,
    target.anchor.closest('dialog[open]') ?? document.body,
  )
}
