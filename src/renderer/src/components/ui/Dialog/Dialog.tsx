import { useEffect, useRef } from 'react'
import type { ComponentPropsWithoutRef, JSX, RefObject } from 'react'
import './Dialog.css'

export type DialogProps = Omit<
  ComponentPropsWithoutRef<'dialog'>,
  'open' | 'onCancel' | 'onClose' | 'closedby'
> & {
  open: boolean
  onDismiss: () => void
  initialFocus?: RefObject<HTMLElement | null>
}

// Dismissal only requests a state change; the owner can protect an unsaved form.
export function Dialog({
  open,
  onDismiss,
  initialFocus,
  className,
  onKeyDown,
  children,
  ...props
}: DialogProps): JSX.Element | null {
  const panel = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const element = panel.current
    if (!element) {
      return
    }
    const opener = document.activeElement
    // Repeated native Escape requests can become non-cancelable in Chromium.
    element.setAttribute('closedby', 'none')
    element.showModal()
    const target = initialFocus?.current
    if (target && element.contains(target)) {
      target.focus()
    } else if (!element.contains(document.activeElement)) {
      element.focus()
    }
    return () => {
      element.close()
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus({ preventScroll: true })
      }
    }
  }, [open, initialFocus])

  if (!open) {
    return null
  }

  return (
    <dialog
      {...props}
      ref={panel}
      tabIndex={props.tabIndex ?? -1}
      className={className ? `ui-dialog ${className}` : 'ui-dialog'}
      onCancel={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onDismiss()
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault()
          event.stopPropagation()
          onDismiss()
        }
      }}
    >
      {children}
    </dialog>
  )
}
