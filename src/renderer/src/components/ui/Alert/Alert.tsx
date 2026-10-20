import { useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { Dialog } from '../Dialog'
import { Button } from '../Button'
import './Alert.css'

export interface AlertProps {
  open: boolean
  title: string
  description: ReactNode
  children?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  pending?: boolean
  confirmDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
}

// The owner controls async work, errors and whether confirmation closes the alert.
export function Alert({
  open,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  pending = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: AlertProps): React.JSX.Element {
  const titleId = useId()
  const descriptionId = useId()
  const cancel = useRef<HTMLButtonElement>(null)
  function dismiss(): void {
    if (!pending) {
      onCancel()
    }
  }
  return (
    <Dialog
      open={open}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={pending}
      initialFocus={cancel}
      onDismiss={dismiss}
      className="ui-alert"
    >
      <h2 id={titleId}>{title}</h2>
      <div id={descriptionId}>{description}</div>
      {children}
      <footer className="ui-alert-actions">
        <Button ref={cancel} disabled={pending} onClick={dismiss}>
          {cancelLabel}
        </Button>
        <Button
          variant="primary"
          disabled={pending || confirmDisabled}
          onClick={() => {
            if (!pending && !confirmDisabled) {
              onConfirm()
            }
          }}
        >
          {confirmLabel}
        </Button>
      </footer>
    </Dialog>
  )
}
