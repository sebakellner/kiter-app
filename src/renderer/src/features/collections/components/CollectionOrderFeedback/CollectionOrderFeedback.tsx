import type { RefObject } from 'react'
import { Button } from '@renderer/components/ui/Button'
import './collection-order-feedback.css'

export function CollectionOrderFeedback({
  panel,
  manual,
  pending,
  dragging,
  error,
  notice,
  dragNotice,
  onRefresh,
}: {
  panel: RefObject<HTMLElement | null>
  manual: boolean
  pending: boolean
  dragging: boolean
  error: string | null
  notice: string | null
  dragNotice: string | null
  onRefresh: () => void
}): React.JSX.Element {
  return (
    <section
      ref={panel}
      tabIndex={-1}
      aria-label="Collection order"
      className="collection-order-feedback"
    >
      <p className="collection-order-help">
        {manual
          ? 'Drag the handle to reorder Samples on this page. Keyboard move actions are in the Sample menu.'
          : 'Clear search and filters to change the saved order.'}
      </p>
      {dragging && (
        <p role="status" className="collection-order-drag-announcement">
          Drop above or below a Sample. Press Escape to cancel.
        </p>
      )}
      {pending && <p role="status">Saving Collection order…</p>}
      {dragNotice && <p role="status">{dragNotice}</p>}
      {error && (
        <p role="alert">
          {error}{' '}
          <Button disabled={pending} onClick={onRefresh}>
            Refresh order
          </Button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  )
}
