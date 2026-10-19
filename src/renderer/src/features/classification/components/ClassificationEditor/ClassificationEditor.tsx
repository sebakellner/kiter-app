import { useEffect, useRef, useState } from 'react'
import { Button } from '@renderer/components/ui/Button'
import { useClassificationEditor } from './useClassificationEditor'
import './classification-editor.css'

export function ClassificationEditor({
  sampleId,
  anchor,
  onClose,
  onSaved,
  dimension,
}: {
  sampleId: string
  anchor: HTMLElement
  onClose: () => void
  onSaved: () => void
  dimension: 'category' | 'genre'
}): React.JSX.Element {
  const editor = useClassificationEditor(sampleId, onSaved, dimension)
  const plural = dimension === 'category' ? 'categories' : 'genres'
  const dialog = useRef<HTMLDialogElement>(null)
  const [dismiss, setDismiss] = useState(false)
  const [exiting, setExiting] = useState(false)
  const allowExit = useRef(false)
  const exitRequested = useRef(false)
  const disabled = editor.loading || editor.pending

  useEffect(() => {
    const element = dialog.current
    if (!element) {
      return
    }
    element.showModal()
    function position(): void {
      if (!element) {
        return
      }
      const rect = anchor.getBoundingClientRect()
      element.style.left = `${Math.max(8, Math.min(rect.right - element.offsetWidth, window.innerWidth - element.offsetWidth - 8))}px`
      element.style.top = `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - element.offsetHeight - 8))}px`
    }
    position()
    const observer = new ResizeObserver(position)
    observer.observe(element)
    window.addEventListener('resize', position)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', position)
      element.close()
      if (anchor.isConnected) {
        anchor.focus()
      }
    }
  }, [anchor])

  useEffect(() => {
    function preventExit(event: BeforeUnloadEvent): void {
      if (!allowExit.current && (editor.dirty || editor.pending)) {
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
  }, [editor.dirty, editor.pending])

  function finish(): void {
    if (exitRequested.current) {
      allowExit.current = true
      window.close()
    } else {
      onClose()
    }
  }

  function requestDismiss(): void {
    if (editor.pending) {
      return
    }
    if (editor.dirty) {
      setDismiss(true)
    } else {
      onClose()
    }
  }

  async function save(): Promise<void> {
    if (await editor.save()) {
      finish()
    }
  }

  return (
    <dialog
      ref={dialog}
      className="sample-categories-popover"
      aria-labelledby="category-editor-title"
      onCancel={(event) => {
        event.preventDefault()
        event.stopPropagation()
        requestDismiss()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          if (!disabled && !editor.needsReload && editor.dirty) {
            void save()
          }
        }
      }}
    >
      <h3 id="category-editor-title">Edit {plural}</h3>
      <form
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
        noValidate
      >
        {editor.loading && <p role="status">Loading saved {plural}…</p>}
        {editor.error && (
          <p role="alert">
            {editor.error}{' '}
            <Button
              disabled={editor.pending}
              onClick={() => void editor.reload()}
            >
              Reload saved {plural}
            </Button>
          </p>
        )}
        {editor.pending && <p role="status">Saving or refreshing {plural}…</p>}
        {editor.validationError && (
          <p id="category-selection-error" role="alert">
            {editor.validationError}
          </p>
        )}
        {editor.saved && (
          <>
            <p>Selected ({editor.selected.length})</p>
            <ul
              aria-label={`Selected ${plural}`}
              aria-describedby={
                editor.validationError ? 'category-selection-error' : undefined
              }
            >
              {editor.selected.map((category) => (
                <li key={category.id}>
                  {category.name}{' '}
                  <Button
                    disabled={disabled}
                    aria-label={`Remove ${category.name}`}
                    onClick={() => editor.toggle(category)}
                  >
                    ×
                  </Button>
                </li>
              ))}
            </ul>
            {editor.selected.length === 0 && <p>No {plural} selected.</p>}
            <label>
              Search {plural}
              <input
                autoFocus
                type="search"
                maxLength={120}
                value={editor.search}
                disabled={disabled}
                onChange={(event) => editor.query(event.target.value)}
              />
            </label>
            {editor.searching && <p role="status">Loading {plural}…</p>}
            {editor.listError && (
              <p role="alert">
                {editor.listError}{' '}
                <Button disabled={disabled} onClick={editor.retryList}>
                  Retry {plural}
                </Button>
              </p>
            )}
            {!editor.searching && !editor.listError && editor.page && (
              <>
                <ul aria-label={`Available ${plural}`}>
                  {editor.page.items.map((category) => (
                    <li key={category.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={editor.selected.some(
                            ({ id }) => id === category.id,
                          )}
                          disabled={
                            disabled ||
                            (!editor.selected.some(
                              ({ id }) => id === category.id,
                            ) &&
                              editor.selected.length >= 1000)
                          }
                          onChange={() => editor.toggle(category)}
                        />
                        {category.name}
                      </label>
                    </li>
                  ))}
                </ul>
                {editor.page.total === 0 && (
                  <p>
                    {editor.search
                      ? `No matching ${plural}.`
                      : `No ${plural} in your library yet.`}
                  </p>
                )}
                <div
                  aria-label={`${dimension === 'category' ? 'Category' : 'Genre'} pages`}
                >
                  <Button
                    disabled={disabled || editor.offset === 0}
                    onClick={() => editor.move(Math.max(0, editor.offset - 50))}
                  >
                    Previous {plural}
                  </Button>
                  <Button
                    disabled={
                      disabled ||
                      editor.offset + editor.page.items.length >=
                        editor.page.total
                    }
                    onClick={() => editor.move(editor.offset + 50)}
                  >
                    Next {plural}
                  </Button>
                </div>
              </>
            )}
            {editor.needsReload && (
              <p>
                Reload saved {plural} to compare them with your preserved
                selection.
              </p>
            )}
            {!editor.needsReload && editor.saved && (
              <details>
                <summary>Currently saved {plural}</summary>
                <p>
                  {editor.saved.categories.map(({ name }) => name).join(', ') ||
                    'None'}
                </p>
              </details>
            )}
          </>
        )}
        {dismiss ? (
          <section aria-label={`Unsaved ${dimension} changes`}>
            <p>
              {exiting
                ? `Save ${dimension} changes before quitting?`
                : `Save ${dimension} changes before closing?`}
            </p>
            <Button
              disabled={disabled || editor.needsReload || !editor.saved}
              onClick={() => void save()}
            >
              {exiting ? 'Save and quit' : 'Save and close'}
            </Button>
            <Button disabled={editor.pending} onClick={finish}>
              {exiting ? 'Discard and quit' : 'Discard changes'}
            </Button>
            <Button
              disabled={editor.pending}
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
            <Button disabled={editor.pending} onClick={requestDismiss}>
              Cancel
            </Button>
            <Button
              disabled={disabled || !editor.dirty || editor.needsReload}
              onClick={() => void save()}
            >
              Save
            </Button>
          </footer>
        )}
      </form>
    </dialog>
  )
}
