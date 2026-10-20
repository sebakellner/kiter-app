import { useId, useRef } from 'react'
import { Input } from '@renderer/components/ui/Input'
import { Button } from '@renderer/components/ui/Button'
import { Dialog } from '@renderer/components/ui/Dialog'
import {
  useCollectionForm,
  type CollectionFormOptions,
} from './useCollectionForm'
import './collection-form.css'

export function CollectionForm({
  onClose,
  onSaved,
  collection,
  completionLabel = 'Create and open',
}: CollectionFormOptions & {
  completionLabel?: string
}): React.JSX.Element {
  const titleId = useId()
  const nameId = useId()
  const descriptionId = useId()
  const nameInput = useRef<HTMLInputElement>(null)
  const {
    form,
    baseline,
    activeReview,
    error,
    reloadRequired,
    reloading,
    dismiss,
    discard,
    stay,
    reload,
    submit,
  } = useCollectionForm({ onClose, onSaved, collection })
  const {
    register,
    formState: { errors, isSubmitting },
  } = form
  const nameField = register('name')

  return (
    <Dialog
      open
      aria-labelledby={titleId}
      className="collection-form"
      onDismiss={dismiss}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          if (!isSubmitting) {
            void submit()
          }
        }
      }}
    >
      <h2 id={titleId}>
        {collection ? 'Edit Collection' : 'Create Collection'}
      </h2>
      {baseline && reloadRequired && (
        <Button disabled={reloading} onClick={() => void reload()}>
          Reload saved details
        </Button>
      )}
      {baseline && (
        <details>
          <summary>Saved details</summary>
          <p>{baseline.name}</p>
          <p>{baseline.description ?? 'No description'}</p>
        </details>
      )}
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (!isSubmitting) {
            void submit()
          }
        }}
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            event.target instanceof HTMLInputElement &&
            !event.metaKey &&
            !event.ctrlKey
          ) {
            event.preventDefault()
          }
        }}
      >
        <fieldset disabled={isSubmitting || reloading}>
          <label htmlFor={nameId}>Name</label>
          <Input
            id={nameId}
            {...nameField}
            ref={(element) => {
              nameField.ref(element)
              nameInput.current = element
            }}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? `${nameId}-error` : undefined}
          />
          {errors.name && (
            <p id={`${nameId}-error`} role="alert">
              {errors.name.message}
            </p>
          )}
          <label htmlFor={descriptionId}>Description (optional)</label>
          <textarea
            id={descriptionId}
            {...register('description')}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={
              errors.description ? `${descriptionId}-error` : undefined
            }
          />
          {errors.description && (
            <p id={`${descriptionId}-error`} role="alert">
              {errors.description.message}
            </p>
          )}
        </fieldset>
        {error && <p role="alert">{error}</p>}
        {isSubmitting && (
          <p role="status">
            {collection ? 'Saving Collection…' : 'Creating Collection…'}
          </p>
        )}
        {activeReview ? (
          <section aria-label="Unsaved Collection changes">
            <p>
              {activeReview === 'quit'
                ? collection
                  ? 'Save Collection changes before quitting?'
                  : 'Create this Collection before quitting?'
                : collection
                  ? 'Save Collection changes before closing?'
                  : 'Create this Collection before closing?'}
            </p>
            <Button
              variant="primary"
              disabled={isSubmitting || reloading || reloadRequired}
              onClick={() => void submit()}
            >
              {activeReview === 'quit'
                ? 'Save and quit'
                : collection
                  ? 'Save and close'
                  : completionLabel}
            </Button>
            <Button disabled={isSubmitting || reloading} onClick={discard}>
              {activeReview === 'quit' ? 'Discard and quit' : 'Discard changes'}
            </Button>
            <Button
              disabled={isSubmitting || reloading}
              onClick={() => {
                stay()
                nameInput.current?.focus()
              }}
            >
              Stay
            </Button>
          </section>
        ) : (
          <footer>
            <Button disabled={isSubmitting || reloading} onClick={dismiss}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={isSubmitting || reloading || reloadRequired}
            >
              {collection ? 'Save' : 'Create'}
            </Button>
          </footer>
        )}
      </form>
    </Dialog>
  )
}
