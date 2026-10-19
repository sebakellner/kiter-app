import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { UseFormRegister } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { sampleTypeSelectionSchema } from '../../schemas'
import type { SampleTypeSelection } from '../../schemas'
import type { SampleTypeSnapshot } from '@shared/ipc/sampleType'
import { unwrapIpcResult } from '@shared/ipc/result'

export function useSampleTypeEditor(
  sampleId: string,
  onSaved: () => void,
): {
  saved: SampleTypeSnapshot | null
  loading: boolean
  pending: boolean
  dirty: boolean
  error: string | null
  validationError: string | undefined
  needsReload: boolean
  register: UseFormRegister<SampleTypeSelection>
  reload: () => Promise<void>
  save: () => Promise<boolean>
} {
  const { register, reset, setValue, getValues, handleSubmit, formState } =
    useForm<SampleTypeSelection>({
      resolver: zodResolver(sampleTypeSelectionSchema),
      defaultValues: { sampleType: 'unknown' },
      mode: 'onBlur',
      reValidateMode: 'onChange',
    })
  const [saved, setSaved] = useState<SampleTypeSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [needsReload, setNeedsReload] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = useRef(true)
  const busy = useRef(false)

  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])

  useEffect(() => {
    let current = true
    void window.api.classification
      .readSampleType({ sampleId })
      .then(unwrapIpcResult)
      .then((snapshot) => {
        if (current) {
          setSaved(snapshot)
          reset({ sampleType: snapshot.sampleType })
          setLoading(false)
        }
      })
      .catch((reason: unknown) => {
        if (current) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Unable to load saved Sample type.',
          )
          setLoading(false)
        }
      })
    return () => {
      current = false
    }
  }, [sampleId, reset])

  async function reload(): Promise<void> {
    if (busy.current) {
      return
    }
    busy.current = true
    setPending(true)
    try {
      const snapshot = unwrapIpcResult(
        await window.api.classification.readSampleType({ sampleId }),
      )
      if (active.current) {
        const draft = getValues('sampleType')
        reset({ sampleType: snapshot.sampleType })
        if (saved) {
          setValue('sampleType', draft, {
            shouldDirty: true,
            shouldValidate: true,
          })
        }
        setSaved(snapshot)
        setNeedsReload(false)
        setLoading(false)
        setError(null)
      }
    } catch (reason) {
      if (active.current) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'Unable to reload saved Sample type.',
        )
      }
    } finally {
      busy.current = false
      if (active.current) {
        setPending(false)
      }
    }
  }

  async function save(): Promise<boolean> {
    if (!saved || busy.current || pending || loading || needsReload) {
      return false
    }
    let succeeded = false
    await handleSubmit(async (values) => {
      if (busy.current) {
        return
      }
      busy.current = true
      setPending(true)
      setError(null)
      try {
        const snapshot = unwrapIpcResult(
          await window.api.classification.saveSampleType({
            sampleId,
            token: saved.token,
            sampleType: values.sampleType,
          }),
        )
        if (active.current) {
          setSaved(snapshot)
          reset({ sampleType: snapshot.sampleType })
          onSaved()
          succeeded = true
        }
      } catch (reason) {
        if (active.current) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Unable to save Sample type. Reload saved type before retrying.',
          )
          setNeedsReload(true)
        }
      } finally {
        busy.current = false
        if (active.current) {
          setPending(false)
        }
      }
    })()
    return succeeded
  }

  return {
    saved,
    loading,
    pending,
    dirty: saved !== null && formState.isDirty,
    error,
    validationError: formState.errors.sampleType?.message,
    needsReload,
    register,
    reload,
    save,
  }
}
