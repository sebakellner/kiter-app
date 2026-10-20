import { useEffect, useRef, useState } from 'react'
import { useForm, type UseFormReturn } from 'react-hook-form'
import { useBlocker } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import type { Collection } from '@shared/domain/collection'
import { unwrapIpcResult } from '@shared/ipc/result'
import { collectionFormSchema, type CollectionFormValues } from '../../schemas'

export interface CollectionFormOptions {
  onClose: () => void
  onSaved: (collection: Collection) => void
  collection?: Collection
}

interface CollectionFormController {
  form: UseFormReturn<CollectionFormValues>
  baseline: Collection | undefined
  activeReview: 'close' | 'quit' | null
  error: string | null
  reloadRequired: boolean
  reloading: boolean
  dismiss: () => void
  discard: () => void
  stay: () => void
  reload: () => Promise<void>
  submit: () => Promise<void>
}

export function useCollectionForm({
  onClose,
  onSaved,
  collection,
}: CollectionFormOptions): CollectionFormController {
  const allowExit = useRef(false)
  const exitRequested = useRef(false)
  const saving = useRef(false)
  const submission = useRef<Promise<void> | null>(null)
  const allowNavigation = useRef(false)
  const [review, setReview] = useState<'close' | 'quit' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [baseline, setBaseline] = useState(collection)
  const [reloadRequired, setReloadRequired] = useState(false)
  const [reloading, setReloading] = useState(false)
  const form = useForm<CollectionFormValues>({
    resolver: zodResolver(collectionFormSchema),
    defaultValues: {
      name: collection?.name ?? '',
      description: collection?.description ?? '',
    },
    mode: 'onBlur',
    reValidateMode: 'onChange',
  })
  const {
    handleSubmit,
    reset,
    getValues,
    formState: { isDirty, isSubmitting },
  } = form
  const blocker = useBlocker(
    () =>
      !allowNavigation.current && (isDirty || isSubmitting || saving.current),
  )
  const latestBlocker = useRef(blocker)
  useEffect(() => {
    latestBlocker.current = blocker
  }, [blocker])
  const activeReview = review ?? (blocker.state === 'blocked' ? 'close' : null)

  useEffect(() => {
    function preventExit(event: BeforeUnloadEvent): void {
      if (!allowExit.current && (isDirty || isSubmitting || saving.current)) {
        exitRequested.current = true
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
    if (isSubmitting || saving.current || reloading) {
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

  function stay(): void {
    exitRequested.current = false
    setReview(null)
    if (blocker.state === 'blocked') {
      blocker.reset()
    }
  }

  async function save(values: CollectionFormValues): Promise<void> {
    if (saving.current || reloading || reloadRequired) {
      return
    }
    saving.current = true
    setError(null)
    try {
      const saved = unwrapIpcResult(
        await (baseline
          ? window.api.collections.update({
              ...values,
              id: baseline.id,
              expected: {
                name: baseline.name,
                description: baseline.description,
              },
            })
          : window.api.collections.create(values)),
      )
      if (baseline && saved.id !== baseline.id) {
        throw new Error(
          'The saved Collection could not be verified. Reload saved details.',
        )
      }
      if (exitRequested.current) {
        allowExit.current = true
        window.close()
      } else {
        allowNavigation.current = true
        onSaved(saved)
        if (baseline && latestBlocker.current.state === 'blocked') {
          latestBlocker.current.proceed()
        }
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to save the Collection.',
      )
      setReloadRequired(Boolean(baseline))
    } finally {
      saving.current = false
    }
  }

  async function reload(): Promise<void> {
    if (!baseline || reloading || saving.current) {
      return
    }
    setReloading(true)
    try {
      const saved = unwrapIpcResult(
        await window.api.collections.get({ id: baseline.id }),
      )
      if (saved.id !== baseline.id) {
        throw new Error(
          'The saved details could not be verified. Reload them again.',
        )
      }
      const draft = getValues()
      setBaseline(saved)
      reset({ name: saved.name, description: saved.description ?? '' })
      reset(draft, { keepDefaultValues: true })
      setReloadRequired(false)
      setError(null)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to reload saved details.',
      )
    } finally {
      setReloading(false)
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

  return {
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
  }
}
