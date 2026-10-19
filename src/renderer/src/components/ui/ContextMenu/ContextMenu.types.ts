import type { ComponentProps, KeyboardEvent, MouseEvent } from 'react'
import type { PopoverProps } from '../Popover'

export type ContextMenuItem = {
  id: string
  label: string
  disabled?: boolean
  onSelect: (opener: HTMLElement) => void
}

export type ContextMenuTarget = {
  anchor: HTMLElement
  position?: PopoverProps['position']
  initialFocus: 'first' | 'last'
}

export type ContextMenuDismissReason = 'escape' | 'outside' | 'select' | 'tab'

export type ContextMenuProps = {
  id: string
  label: string
  target: ContextMenuTarget | null
  items: ContextMenuItem[]
  onDismiss: (reason: ContextMenuDismissReason) => void
}

export type ContextMenuController = {
  menuProps: Pick<ContextMenuProps, 'id' | 'target' | 'onDismiss'>
  triggerProps: Pick<
    ComponentProps<'button'>,
    | 'type'
    | 'aria-haspopup'
    | 'aria-expanded'
    | 'aria-controls'
    | 'onClick'
    | 'onKeyDown'
    | 'onDragStart'
    | 'draggable'
  >
  onContextMenu: (event: MouseEvent<HTMLElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  onClick: () => void
}
