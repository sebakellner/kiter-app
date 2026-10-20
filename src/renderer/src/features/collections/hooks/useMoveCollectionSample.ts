import { useEffect, useRef, useState } from 'react'
import { IpcError, unwrapIpcResult } from '@shared/ipc/result'
import type { LibraryPage } from '@shared/ipc/library'
import type {
  CollectionMoveRequest,
  CollectionMoveResult,
  CollectionPlaceRequest,
} from '@shared/domain/collection'

type Target = { id: string; name: string }
type MoveState = {
  pending: boolean
  sourcePage: LibraryPage
  error: string | null
  notice: string | null
}

export function useMoveCollectionSample({
  collectionId,
  page,
  enabled,
  loading,
  pageError,
  onMoved,
  onRefresh,
}: {
  collectionId: string | undefined
  page: LibraryPage | null
  enabled: boolean
  loading: boolean
  pageError: string | null
  onMoved: (result: CollectionMoveResult) => void
  onRefresh: () => void
}): {
  pending: boolean
  blocked: boolean
  error: string | null
  notice: string | null
  move: (
    sample: Target,
    direction: CollectionMoveRequest['direction'],
  ) => Promise<void>
  place: (
    sample: Target,
    targetSampleId: string,
    placement: CollectionPlaceRequest['placement'],
    token: string,
  ) => Promise<void>
} {
  const [state, setState] = useState<MoveState | null>(null)
  const inFlight = useRef(false)
  const attemptedPage = useRef<LibraryPage | null>(null)
  const mounted = useRef(true)
  const quitRequested = useRef(false)
  const allowExit = useRef(false)

  useEffect(() => {
    mounted.current = true
    function preventExit(event: BeforeUnloadEvent): void {
      if (inFlight.current && !allowExit.current) {
        // Record the intent synchronously: the save reply may arrive before
        // main's close-request notification makes the IPC round trip.
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

  async function perform(
    sample: Target,
    intent:
      | { direction: CollectionMoveRequest['direction'] }
      | Pick<CollectionPlaceRequest, 'targetSampleId' | 'placement' | 'token'>,
  ): Promise<void> {
    if (
      !collectionId ||
      !page?.collectionOrderToken ||
      !enabled ||
      loading ||
      pageError ||
      inFlight.current ||
      attemptedPage.current === page
    ) {
      return
    }
    inFlight.current = true
    allowExit.current = false
    quitRequested.current = false
    attemptedPage.current = page
    setState({ pending: true, sourcePage: page, error: null, notice: null })
    try {
      const result = unwrapIpcResult(
        await ('direction' in intent
          ? window.api.collections.moveSample({
              collectionId,
              sampleId: sample.id,
              direction: intent.direction,
              token: page.collectionOrderToken,
            })
          : window.api.collections.placeSample({
              collectionId,
              sampleId: sample.id,
              targetSampleId: intent.targetSampleId,
              placement: intent.placement,
              token: intent.token,
            })),
      )
      if (!mounted.current) {
        return
      }
      if (
        result.collectionId !== collectionId ||
        result.sampleId !== sample.id
      ) {
        throw new IpcError(
          'PROTOCOL_ERROR',
          'The saved move could not be verified. Refresh the Collection before repeating it.',
        )
      }
      setState({
        pending: false,
        sourcePage: page,
        error: null,
        notice: result.changed
          ? `${sample.name} moved to position ${result.index + 1}.`
          : 'This Sample is already in that position.',
      })
      onMoved(result)
      if (quitRequested.current) {
        allowExit.current = true
        window.close()
      }
    } catch (reason) {
      if (mounted.current) {
        setState({
          pending: false,
          sourcePage: page,
          notice: null,
          error:
            reason instanceof Error
              ? reason.message
              : 'Unable to save the Collection order. Refresh before repeating the move.',
        })
        // Reload, but never replay a failed intent against a different sequence.
        onRefresh()
      }
    } finally {
      inFlight.current = false
      quitRequested.current = false
    }
  }

  return {
    pending: Boolean(state?.pending),
    blocked: Boolean(state && state.sourcePage === page),
    error: state?.error ?? null,
    notice: state?.notice ?? null,
    move: (sample, direction) => perform(sample, { direction }),
    place: (sample, targetSampleId, placement, token) =>
      perform(sample, { targetSampleId, placement, token }),
  }
}
