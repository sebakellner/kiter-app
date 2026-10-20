import { useCallback, useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import type { CollectionPlaceRequest } from '@shared/domain/collection'

export const COLLECTION_REORDER_MIME = 'application/x-kiter-collection-sample'
type Target = { id: string; name: string }
type Placement = CollectionPlaceRequest['placement']
type ActiveDrag = {
  sample: Target
  collectionId: string
  token: string
  offset: number
}

export type CollectionDragController = {
  enabled: boolean
  draggingId: string | null
  target: { sampleId: string; placement: Placement } | null
  notice: string | null
  start: (event: DragEvent<HTMLElement>, sample: Target) => void
  over: (event: DragEvent<HTMLElement>, sample: Target) => void
  leave: (event: DragEvent<HTMLElement>, sample: Target) => void
  drop: (event: DragEvent<HTMLElement>, sample: Target) => void
  end: () => void
}

export function useCollectionDrag({
  collectionId,
  token,
  enabled,
  offset,
  onSelect,
  onPlace,
}: {
  collectionId: string | undefined
  token: string | undefined
  enabled: boolean
  offset: number
  onSelect: (sample: Target) => void
  onPlace: (
    sample: Target,
    targetId: string,
    placement: Placement,
    token: string,
  ) => void
}): CollectionDragController {
  const active = useRef<ActiveDrag | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [target, setTarget] = useState<CollectionDragController['target']>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const clear = useCallback((): void => {
    active.current = null
    setDraggingId(null)
    setTarget(null)
  }, [])

  useEffect(() => {
    const current = active.current
    if (
      current &&
      (!enabled ||
        current.collectionId !== collectionId ||
        current.token !== token ||
        current.offset !== offset)
    ) {
      clear()
      setNotice(
        'The view changed. Drag the Sample again after the current order loads.',
      )
    }
  }, [collectionId, token, enabled, offset, clear])
  useEffect(
    () => () => {
      active.current = null
    },
    [],
  )

  function accepts(event: DragEvent<HTMLElement>): boolean {
    const current = active.current
    return Boolean(
      enabled &&
      current &&
      current.collectionId === collectionId &&
      current.token === token &&
      current.offset === offset &&
      Array.from(event.dataTransfer.types).includes(COLLECTION_REORDER_MIME),
    )
  }
  function placement(event: DragEvent<HTMLElement>): Placement {
    const rect = event.currentTarget.getBoundingClientRect()
    return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
  }

  return {
    enabled,
    draggingId,
    target,
    notice,
    start: (event, sample) => {
      event.stopPropagation()
      if (!enabled || !collectionId || !token) {
        event.preventDefault()
        return
      }
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData(COLLECTION_REORDER_MIME, sample.id)
      const row = event.currentTarget.closest<HTMLElement>('[role="row"]')
      if (row) {
        event.dataTransfer.setDragImage(row, 12, 12)
      }
      const source = { id: sample.id, name: sample.name }
      active.current = { sample: source, collectionId, token, offset }
      setDraggingId(sample.id)
      setTarget(null)
      onSelect(source)
    },
    over: (event, sample) => {
      if (!accepts(event)) {
        if (Array.from(event.dataTransfer.types).includes('Files')) {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'none'
        }
        return
      }
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = 'move'
      setTarget(
        active.current?.sample.id === sample.id
          ? null
          : { sampleId: sample.id, placement: placement(event) },
      )
    },
    leave: (event, sample) => {
      if (
        event.relatedTarget instanceof Node &&
        event.currentTarget.contains(event.relatedTarget)
      ) {
        return
      }
      setTarget((current) => (current?.sampleId === sample.id ? null : current))
    },
    drop: (event, sample) => {
      if (!accepts(event)) {
        if (Array.from(event.dataTransfer.types).includes('Files')) {
          event.preventDefault()
        }
        clear()
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const current = active.current!
      const matches =
        event.dataTransfer.getData(COLLECTION_REORDER_MIME) ===
        current.sample.id
      const edge = placement(event)
      clear()
      setNotice(null)
      if (matches && current.sample.id !== sample.id) {
        onPlace(current.sample, sample.id, edge, current.token)
      }
    },
    end: clear,
  }
}
