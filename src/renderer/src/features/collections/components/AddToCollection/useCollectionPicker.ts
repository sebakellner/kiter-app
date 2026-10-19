import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type {
  Collection,
  CollectionDestination,
  CollectionPage,
} from '@shared/domain/collection'
import { unwrapIpcResult } from '@shared/ipc/result'
import {
  collectionPickerSchema,
  type CollectionPickerValues,
} from '../../schemas'

type Choice = Pick<Collection, 'id' | 'name'>
export type MembershipOutcome = Choice & {
  status: 'added' | 'already-included' | 'failed'
  message?: string
  code?: string
}

type PickerController = {
  form: UseFormReturn<CollectionPickerValues>
  selected: Choice[]
  toggle: (choice: Choice, checked: boolean) => void
  request: { search: string; offset: number; version: number }
  loading: boolean
  page: CollectionPage<CollectionDestination> | null
  error: string | null
  pending: boolean
  outcomes: MembershipOutcome[] | null
  submit: ReturnType<UseFormReturn<CollectionPickerValues>['handleSubmit']>
  retryFailed: () => Promise<void>
  canRetry: boolean
  refresh: () => void
  search: (search: string) => void
  load: (offset: number) => void
  chooseAgain: () => void
}

export function useCollectionPicker(sampleId: string): PickerController {
  const form = useForm<CollectionPickerValues>({
    resolver: zodResolver(collectionPickerSchema),
    defaultValues: { collectionIds: [] },
  })
  const selectedIds = useWatch({ control: form.control, name: 'collectionIds' })
  const [choices, setChoices] = useState<Choice[]>([])
  const [request, setRequest] = useState({ search: '', offset: 0, version: 0 })
  const key = JSON.stringify([sampleId, request])
  const [result, setResult] = useState<{
    key: string
    page: CollectionPage<CollectionDestination> | null
    error: string | null
  } | null>(null)
  const [pending, setPending] = useState(false)
  const [outcomes, setOutcomes] = useState<MembershipOutcome[] | null>(null)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const quitRequested = useRef(false)
  const allowExit = useRef(false)
  const loading = result?.key !== key

  useEffect(() => {
    mounted.current = true
    function beforeUnload(event: BeforeUnloadEvent): void {
      if (inFlight.current && !allowExit.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    const unsubscribe = window.api.lifecycle.onCloseRequested(() => {
      if (inFlight.current) {
        quitRequested.current = true
      }
    })
    return () => {
      mounted.current = false
      window.removeEventListener('beforeunload', beforeUnload)
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        let page = unwrapIpcResult(
          await window.api.collections.destinations({
            sampleId,
            search: request.search,
            offset: request.offset,
          }),
        )
        if (!active) {
          return
        }
        if (page.offset > 0 && page.items.length === 0) {
          page = unwrapIpcResult(
            await window.api.collections.destinations({
              sampleId,
              search: request.search,
              offset: Math.max(
                0,
                Math.floor((page.total - 1) / page.limit) * page.limit,
              ),
            }),
          )
        }
        if (active) {
          setResult({ key, page, error: null })
        }
      } catch (reason) {
        if (active) {
          setResult((current) => ({
            key,
            page: current?.page ?? null,
            error:
              reason instanceof Error
                ? reason.message
                : 'Unable to load Collections.',
          }))
        }
      }
    })()
    return () => {
      active = false
    }
  }, [sampleId, request, key])

  function toggle(choice: Choice, checked: boolean): void {
    if (inFlight.current) {
      return
    }
    const ids = form.getValues('collectionIds')
    const next = checked
      ? [...ids.filter((id) => id !== choice.id), choice.id]
      : ids.filter((id) => id !== choice.id)
    form.setValue('collectionIds', next, {
      shouldDirty: true,
      shouldValidate: true,
    })
    setChoices((current) =>
      checked
        ? [...current.filter(({ id }) => id !== choice.id), choice]
        : current.filter(({ id }) => id !== choice.id),
    )
  }

  async function apply(destinations: Choice[]): Promise<void> {
    if (inFlight.current || destinations.length === 0) {
      return
    }
    inFlight.current = true
    setPending(true)
    const next: MembershipOutcome[] = []
    try {
      for (const destination of destinations) {
        if (!mounted.current) {
          break
        }
        try {
          const reply = await window.api.collections.setMembership({
            collectionId: destination.id,
            sampleId,
            assigned: true,
          })
          next.push(
            reply.ok
              ? {
                  ...destination,
                  status: reply.data.changed ? 'added' : 'already-included',
                }
              : {
                  ...destination,
                  status: 'failed',
                  message: reply.error.message,
                  code: reply.error.code,
                },
          )
        } catch (reason) {
          next.push({
            ...destination,
            status: 'failed',
            message:
              reason instanceof Error
                ? reason.message
                : 'Unable to add this Sample.',
          })
        }
      }
      if (mounted.current) {
        setOutcomes((current) => [
          ...(current ?? []).filter(
            ({ id }) => !next.some((item) => item.id === id),
          ),
          ...next,
        ])
        setRequest((current) => ({ ...current, version: current.version + 1 }))
        if (
          quitRequested.current &&
          next.length === destinations.length &&
          next.every(({ status }) => status !== 'failed')
        ) {
          allowExit.current = true
          window.close()
        }
      }
    } finally {
      inFlight.current = false
      quitRequested.current = false
      if (mounted.current) {
        setPending(false)
      }
    }
  }

  const selected = choices.filter(({ id }) => selectedIds.includes(id))
  return {
    form,
    selected,
    toggle,
    request,
    loading,
    page: result?.page ?? null,
    error: loading ? null : (result?.error ?? null),
    pending,
    outcomes,
    submit: form.handleSubmit(() => apply(selected)),
    retryFailed: () =>
      apply((outcomes ?? []).filter(({ status }) => status === 'failed')),
    canRetry:
      Boolean(outcomes?.some(({ status }) => status === 'failed')) &&
      !outcomes?.some(
        ({ status, code }) =>
          status === 'failed' &&
          (code === 'NOT_FOUND' || code === 'INVALID_INPUT'),
      ),
    refresh: () =>
      setRequest((current) => ({ ...current, version: current.version + 1 })),
    search: (search: string) =>
      setRequest((current) => ({ ...current, search, offset: 0 })),
    load: (offset: number) => setRequest((current) => ({ ...current, offset })),
    chooseAgain: () => {
      setOutcomes(null)
      setChoices([])
      form.reset({ collectionIds: [] })
      setRequest((current) => ({ ...current, version: current.version + 1 }))
    },
  }
}
