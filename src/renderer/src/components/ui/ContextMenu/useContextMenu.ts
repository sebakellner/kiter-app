import { useCallback, useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type {
  ContextMenuController,
  ContextMenuDismissReason,
  ContextMenuTarget,
} from './ContextMenu.types'

export function useContextMenu(): ContextMenuController {
  const id = useId()
  const [target, setTarget] = useState<ContextMenuTarget | null>(null)
  const dismiss = useCallback(
    (reason: ContextMenuDismissReason): void => {
      if (reason !== 'outside' && target?.anchor.isConnected) {
        target.anchor.focus({ preventScroll: true })
      }
      setTarget(null)
    },
    [target],
  )

  function openFromKeyboard(event: KeyboardEvent<HTMLElement>): void {
    if (event.defaultPrevented) {
      return
    }
    if (
      event.key === 'ContextMenu' ||
      (event.key === 'F10' && event.shiftKey)
    ) {
      event.preventDefault()
      event.stopPropagation()
      setTarget({ anchor: event.currentTarget, initialFocus: 'first' })
    }
  }

  return {
    menuProps: { id, target, onDismiss: dismiss },
    triggerProps: {
      type: 'button',
      draggable: false,
      'aria-haspopup': 'menu',
      'aria-expanded': target !== null,
      'aria-controls': target ? id : undefined,
      onClick: (event) => {
        event.stopPropagation()
        setTarget(
          target
            ? null
            : { anchor: event.currentTarget, initialFocus: 'first' },
        )
      },
      onKeyDown: (event) => {
        openFromKeyboard(event)
        if (
          !event.defaultPrevented &&
          (event.key === 'ArrowDown' || event.key === 'ArrowUp')
        ) {
          event.preventDefault()
          event.stopPropagation()
          setTarget({
            anchor: event.currentTarget,
            initialFocus: event.key === 'ArrowUp' ? 'last' : 'first',
          })
        }
      },
      onDragStart: (event) => {
        event.preventDefault()
        event.stopPropagation()
      },
    },
    onContextMenu: (event) => {
      if (event.defaultPrevented) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      setTarget({
        anchor: event.currentTarget,
        position:
          event.clientX || event.clientY
            ? { x: event.clientX, y: event.clientY }
            : undefined,
        initialFocus: 'first',
      })
    },
    onKeyDown: (event) => {
      if (event.target === event.currentTarget) {
        openFromKeyboard(event)
      }
    },
    onClick: () => setTarget(null),
  }
}
