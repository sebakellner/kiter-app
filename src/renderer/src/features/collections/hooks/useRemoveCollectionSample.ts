import { useEffect, useRef, useState } from 'react'
import { unwrapIpcResult } from '@shared/ipc/result'

type Target = { id: string; name: string }

export function useRemoveCollectionSample(
  collectionId: string | undefined,
  onChanged: () => void,
): {
  pending: boolean
  error: string | null
  notice: string | null
  remove: (sample: Target) => Promise<void>
  retry: () => Promise<void>
} {
  const [state, setState] = useState<{
    sample: Target
    pending: boolean
    error: string | null
  } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const quitRequested = useRef(false)
  const allowExit = useRef(false)
  useEffect(() => {
    mounted.current = true
    function preventExit(event: BeforeUnloadEvent): void {
      if (inFlight.current && !allowExit.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', preventExit)
    const unsubscribe = window.api.lifecycle.onCloseRequested(() => {
      if (inFlight.current) {
        quitRequested.current = true
      }
    })
    return () => {
      mounted.current = false
      window.removeEventListener('beforeunload', preventExit)
      unsubscribe()
    }
  }, [])

  async function remove(sample: Target): Promise<void> {
    if (!collectionId || inFlight.current) {
      return
    }
    inFlight.current = true
    setNotice(null)
    setState({ sample, pending: true, error: null })
    try {
      const result = unwrapIpcResult(
        await window.api.collections.setMembership({
          collectionId,
          sampleId: sample.id,
          assigned: false,
        }),
      )
      if (!mounted.current) {
        return
      }
      setNotice(
        result.changed
          ? `${sample.name} removed from this Collection. The Sample remains in your library.`
          : 'This Sample is no longer in this Collection.',
      )
      setState(null)
      onChanged()
      if (quitRequested.current) {
        allowExit.current = true
        window.close()
      }
    } catch (reason) {
      if (mounted.current) {
        setState({
          sample,
          pending: false,
          error:
            reason instanceof Error
              ? reason.message
              : 'Unable to remove this Sample from the Collection.',
        })
      }
    } finally {
      inFlight.current = false
      quitRequested.current = false
    }
  }
  return {
    pending: Boolean(state?.pending),
    error: state?.error ?? null,
    notice,
    remove,
    retry: () => (state ? remove(state.sample) : Promise.resolve()),
  }
}
