import { useEffect, useId, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useBlocker } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import type { Collection } from '@shared/domain/collection'
import { unwrapIpcResult } from '@shared/ipc/result'
import { Input } from '@renderer/components/ui/Input'
import { Button } from '@renderer/components/ui/Button'
import { Dialog } from '@renderer/components/ui/Dialog'
import { collectionFormSchema, type CollectionFormValues } from '../schemas'
import '../collections.css'

export function CreateCollection({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (collection: Collection) => void
}): React.JSX.Element {
  const titleId = useId()
  const nameId = useId()
  const descriptionId = useId()
  const allowExit = useRef(false)
  const exitRequested = useRef(false)
  const saving = useRef(false)
  const submission = useRef<Promise<void> | null>(null)
  const allowNavigation = useRef(false)
  const [review, setReview] = useState<'close' | 'quit' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<CollectionFormValues>({
    resolver: zodResolver(collectionFormSchema),
    defaultValues: { name: '', description: '' },
    mode: 'onBlur',
    reValidateMode: 'onChange',
  })
  const blocker = useBlocker(
    () =>
      !allowNavigation.current && (isDirty || isSubmitting || saving.current),
  )
  const activeReview = review ?? (blocker.state === 'blocked' ? 'close' : null)

  useEffect(() => {
    function preventExit(event: BeforeUnloadEvent): void {
      if (!allowExit.current && (isDirty || isSubmitting || saving.current)) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', preventExit)
    const unsubscribe = window.api.lifecycle.onCloseRequested(() => {
      exitRequested.current = true
      setReview('quit')
    })
    return () => {
      window.removeEventListener('beforeunload', preventExit)
      unsubscribe()
    }
  }, [isDirty, isSubmitting])

  function dismiss(): void {
    if (isSubmitting || saving.current) {
      return
    }
    if (isDirty) {
      setReview('close')
    } else {
      onClose()
      if (blocker.state === 'blocked') {
        blocker.proceed()
      }
    }
  }

  function discard(): void {
    if (exitRequested.current) {
      allowExit.current = true
      window.close()
    } else {
      onClose()
      if (blocker.state === 'blocked') {
        blocker.proceed()
      }
    }
  }

  async function save(values: CollectionFormValues): Promise<void> {
    if (saving.current) {
      return
    }
    saving.current = true
    setError(null)
    try {
      const collection = unwrapIpcResult(
        await window.api.collections.create(values),
      )
      if (exitRequested.current) {
        allowExit.current = true
        window.close()
      } else {
        allowNavigation.current = true
        onCreated(collection)
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to create the Collection.',
      )
    } finally {
      saving.current = false
    }
  }

  async function submit(): Promise<void> {
    if (submission.current) {
      return submission.current
    }
    const request = handleSubmit(save)()
    submission.current = request
    try {
      await request
    } finally {
      submission.current = null
    }
  }

  return (
    <Dialog
      open
      aria-labelledby={titleId}
      className="collection-create"
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
      <h2 id={titleId}>Create Collection</h2>
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
        <fieldset disabled={isSubmitting}>
          <label htmlFor={nameId}>Name</label>
          <Input
            id={nameId}
            {...register('name')}
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
        {isSubmitting && <p role="status">Creating Collection…</p>}
        {activeReview ? (
          <section aria-label="Unsaved Collection changes">
            <p>
              {activeReview === 'quit'
                ? 'Create this Collection before quitting?'
                : 'Create this Collection before closing?'}
            </p>
            <Button disabled={isSubmitting} onClick={() => void submit()}>
              {activeReview === 'quit' ? 'Save and quit' : 'Create and open'}
            </Button>
            <Button disabled={isSubmitting} onClick={discard}>
              {activeReview === 'quit' ? 'Discard and quit' : 'Discard changes'}
            </Button>
            <Button
              disabled={isSubmitting}
              onClick={() => {
                exitRequested.current = false
                setReview(null)
                if (blocker.state === 'blocked') {
                  blocker.reset()
                }
              }}
            >
              Stay
            </Button>
          </section>
        ) : (
          <footer>
            <Button disabled={isSubmitting} onClick={dismiss}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Create
            </Button>
          </footer>
        )}
      </form>
    </Dialog>
  )
}
