import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Toast } from './Toast'
import type { ToastNotice } from './toastState'
import './ToastViewport.css'

export function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastNotice[]
  onDismiss: (id: number) => void
}): React.JSX.Element {
  const [host, setHost] = useState<HTMLElement>(document.body)

  useEffect(() => {
    // Native modal dialogs make outside controls inert and cover normal z-indexes.
    // Keep the single viewport inside the active dialog, returning it on dismissal.
    function updateHost(): void {
      const dialogs =
        document.querySelectorAll<HTMLDialogElement>('dialog[open]')
      const focused =
        document.activeElement?.closest<HTMLDialogElement>('dialog[open]')
      setHost(focused ?? dialogs.item(dialogs.length - 1) ?? document.body)
    }
    updateHost()
    const observer = new MutationObserver(updateHost)
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open'],
    })
    return () => observer.disconnect()
  }, [])

  return createPortal(
    <section className="toast-viewport" aria-label="Notifications">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          variant={toast.variant}
          onDismiss={() => onDismiss(toast.id)}
        />
      ))}
    </section>,
    host,
  )
}
