import { useEffect, useRef } from 'react'
import type { HTMLAttributes, JSX, RefObject } from 'react'
import './Popover.css'

export type PopoverDismissReason = 'escape' | 'outside'

export type PopoverProps = Omit<HTMLAttributes<HTMLElement>, 'onCancel'> & {
  open: boolean
  anchor: HTMLElement | RefObject<HTMLElement | null>
  onDismiss: (reason: PopoverDismissReason) => void
  modal?: boolean
  align?: 'start' | 'end'
  matchAnchorWidth?: boolean
  dismissOnOutside?: boolean
  restoreFocus?: boolean
}

// Keep dismissal on the innermost layer, including popovers inside dialogs.
const layers: HTMLElement[] = []

export function Popover({
  open,
  anchor,
  onDismiss,
  modal = false,
  align = 'start',
  matchAnchorWidth = false,
  dismissOnOutside = !modal,
  restoreFocus = modal,
  className,
  onKeyDown,
  children,
  ...props
}: PopoverProps): JSX.Element | null {
  const panel = useRef<HTMLElement | null>(null)
  const dismiss = useRef(onDismiss)

  useEffect(() => {
    dismiss.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    if (!open) {
      return
    }
    const element = panel.current
    const target = anchor instanceof HTMLElement ? anchor : anchor.current
    if (!element || !target) {
      return
    }
    const parentIndex = layers.findIndex((layer) => element.contains(layer))
    layers.splice(parentIndex < 0 ? layers.length : parentIndex, 0, element)
    if (element instanceof HTMLDialogElement) {
      element.showModal()
    }

    function position(): void {
      if (!element || !target) {
        return
      }
      const rect = target.getBoundingClientRect()
      if (matchAnchorWidth) {
        element.style.width = `${rect.width}px`
      }
      const left =
        align === 'end' ? rect.right - element.offsetWidth : rect.left
      const below = rect.bottom + 4
      const top =
        below + element.offsetHeight <= window.innerHeight - 8
          ? below
          : rect.top - element.offsetHeight - 4
      element.style.left = `${Math.max(8, Math.min(left, window.innerWidth - element.offsetWidth - 8))}px`
      element.style.top = `${Math.max(8, Math.min(top, window.innerHeight - element.offsetHeight - 8))}px`
    }

    function outside(event: PointerEvent): void {
      if (
        layers.at(-1) !== element ||
        !dismissOnOutside ||
        !(event.target instanceof Node) ||
        element?.contains(event.target) ||
        target?.contains(event.target)
      ) {
        return
      }
      if (modal) {
        event.preventDefault()
        event.stopPropagation()
      }
      dismiss.current('outside')
    }

    function escape(event: KeyboardEvent): void {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        layers.at(-1) === element
      ) {
        event.preventDefault()
        event.stopPropagation()
        dismiss.current('escape')
      }
    }

    position()
    const observer = new ResizeObserver(position)
    observer.observe(element)
    observer.observe(target)
    window.addEventListener('resize', position)
    document.addEventListener('scroll', position, true)
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', escape)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', position)
      document.removeEventListener('scroll', position, true)
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', escape)
      const index = layers.indexOf(element)
      if (index >= 0) {
        layers.splice(index, 1)
      }
      if (element instanceof HTMLDialogElement) {
        element.close()
      }
      if (restoreFocus && target.isConnected) {
        target.focus({ preventScroll: true })
      }
    }
  }, [
    open,
    anchor,
    modal,
    align,
    matchAnchorWidth,
    dismissOnOutside,
    restoreFocus,
  ])

  if (!open) {
    return null
  }
  const Component = modal ? 'dialog' : 'div'
  return (
    <Component
      {...props}
      ref={(element) => {
        panel.current = element
      }}
      className={className ? `ui-popover ${className}` : 'ui-popover'}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (
          event.key === 'Escape' &&
          !event.defaultPrevented &&
          layers.at(-1) === panel.current
        ) {
          event.preventDefault()
          event.stopPropagation()
          dismiss.current('escape')
        }
      }}
      onCancel={
        modal
          ? (event) => {
              event.preventDefault()
              event.stopPropagation()
              if (layers.at(-1) === panel.current) {
                dismiss.current('escape')
              }
            }
          : undefined
      }
    >
      {children}
    </Component>
  )
}
