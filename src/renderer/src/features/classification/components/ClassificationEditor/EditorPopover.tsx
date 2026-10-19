import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@renderer/components/ui/Button'
import { Popover } from '@renderer/components/ui/Popover'
import './classification-editor.css'

export function EditorPopover({
  anchor,
  title,
  subject,
  dirty,
  pending,
  canSave,
  onSave,
  onClose,
  children,
}: {
  anchor: HTMLElement
  title: string
  subject: string
  dirty: boolean
  pending: boolean
  canSave: boolean
  onSave: () => Promise<boolean>
  onClose: () => void
  children: ReactNode
}): React.JSX.Element {
  const titleId = useId()
  const [dismiss, setDismiss] = useState(false)
  const [exiting, setExiting] = useState(false)
  const allowExit = useRef(false)
  const exitRequested = useRef(false)

  useEffect(() => {
    function preventExit(event: BeforeUnloadEvent): void {
      if (!allowExit.current && (dirty || pending)) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', preventExit)
    const unsubscribe = window.api.lifecycle.onCloseRequested(() => {
      exitRequested.current = true
      setExiting(true)
      setDismiss(true)
    })
    return () => {
      window.removeEventListener('beforeunload', preventExit)
      unsubscribe()
    }
  }, [dirty, pending])

  function finish(): void {
    if (exitRequested.current) {
      allowExit.current = true
      window.close()
    } else {
      onClose()
    }
  }

  function requestDismiss(): void {
    if (pending) {
      return
    }
    if (dirty) {
      setDismiss(true)
    } else {
      onClose()
    }
  }

  async function save(): Promise<void> {
    if (canSave && !pending && (await onSave())) {
      finish()
    }
  }

  return (
    <Popover
      open
      modal
      anchor={anchor}
      align="end"
      dismissOnOutside={false}
      onDismiss={requestDismiss}
      className="sample-categories-popover"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          void save()
        }
      }}
    >
      <h3 id={titleId}>{title}</h3>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            event.target instanceof HTMLInputElement &&
            event.target.type === 'search' &&
            !event.metaKey &&
            !event.ctrlKey
          ) {
            event.preventDefault()
          }
        }}
      >
        {children}
        {dismiss ? (
          <section aria-label={`Unsaved ${subject} changes`}>
            <p>
              {exiting
                ? `Save ${subject} changes before quitting?`
                : `Save ${subject} changes before closing?`}
            </p>
            <Button disabled={!canSave || pending} onClick={() => void save()}>
              {exiting ? 'Save and quit' : 'Save and close'}
            </Button>
            <Button disabled={pending} onClick={finish}>
              {exiting ? 'Discard and quit' : 'Discard changes'}
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                setDismiss(false)
                setExiting(false)
                exitRequested.current = false
              }}
            >
              Stay
            </Button>
          </section>
        ) : (
          <footer>
            <Button disabled={pending} onClick={requestDismiss}>
              Cancel
            </Button>
            <Button
              disabled={!canSave || !dirty || pending}
              onClick={() => void save()}
            >
              Save
            </Button>
          </footer>
        )}
      </form>
    </Popover>
  )
}
