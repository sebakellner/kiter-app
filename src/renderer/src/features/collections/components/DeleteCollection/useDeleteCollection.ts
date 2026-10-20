import { useEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import type { CollectionRemovalReview } from '@shared/domain/collection'
import { unwrapIpcResult } from '@shared/ipc/result'

export function useDeleteCollection(
  id: string,
  onDeleted: () => void,
): {
  review: CollectionRemovalReview | null
  loading: boolean
  pending: boolean
  error: string | null
  reload: () => void
  confirm: () => Promise<void>
} {
  const [review, setReview] = useState<CollectionRemovalReview | null>(null)
  const [version, setVersion] = useState(0)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const quitRequested = useRef(false)
  const allowExit = useRef(false)
  const blocker = useBlocker(() => inFlight.current)

  useEffect(() => {
    if (!pending && blocker.state === 'blocked') {
      blocker.reset()
    }
  }, [pending, blocker])

  useEffect(() => {
    mounted.current = true
    function preventExit(event: BeforeUnloadEvent): void {
      if (inFlight.current && !allowExit.current) {
        quitRequested.current = true
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

  useEffect(() => {
    let active = true
    async function load(): Promise<void> {
      setLoading(true)
      setReview(null)
      setError(null)
      try {
        const result = unwrapIpcResult(
          await window.api.collections.reviewRemoval({ id }),
        )
        if (result.entity.id !== id) {
          throw new Error('The Collection review could not be verified.')
        }
        if (active) {
          setReview(result)
        }
      } catch (reason) {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Unable to review this Collection.',
          )
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [id, version])

  async function confirm(): Promise<void> {
    if (!review || loading || inFlight.current) {
      return
    }
    inFlight.current = true
    setPending(true)
    setError(null)
    try {
      const result = unwrapIpcResult(
        await window.api.collections.remove({ id, token: review.token }),
      )
      if (result.id !== id) {
        throw new Error(
          'Collection deletion could not be verified. Review it again.',
        )
      }
      if (!mounted.current) {
        return
      }
      inFlight.current = false
      if (quitRequested.current) {
        allowExit.current = true
        window.close()
      } else {
        onDeleted()
      }
    } catch (reason) {
      if (mounted.current) {
        setReview(null)
        setError(
          reason instanceof Error
            ? reason.message
            : 'Unable to verify deletion. Review the Collection again.',
        )
      }
    } finally {
      inFlight.current = false
      quitRequested.current = false
      if (mounted.current) {
        setPending(false)
      }
    }
  }

  return {
    review,
    loading,
    pending,
    error,
    reload: () => {
      if (!inFlight.current) {
        setVersion((value) => value + 1)
      }
    },
    confirm,
  }
}
