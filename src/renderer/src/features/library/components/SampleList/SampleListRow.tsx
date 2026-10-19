import type { ComponentProps } from 'react'
import { Button } from '@renderer/components/ui/Button'
import {
  ContextMenu,
  useContextMenu,
} from '@renderer/components/ui/ContextMenu'
import type { FavoriteState } from '@shared/ipc'
import { FavoriteButton } from '../FavoriteButton'
import { Waveform } from '../Waveform'
import type { ListSample } from './useSampleList'
import type { CollectionDragController } from '@renderer/features/collections/hooks/useCollectionDrag'
import type { CollectionMoveRequest } from '@shared/domain/collection'

type Props = {
  sample: ListSample
  rowProps: ComponentProps<'li'>
  playing: boolean
  dragError: string | null
  onPreview: () => void
  onFavoriteChanged: (state: FavoriteState) => void
  onInspect?: (opener: HTMLElement) => void
  inspectorOpen: boolean
  onAddToCollection?: () => void
  onRemoveFromCollection?: () => void
  membershipPending: boolean
  order?: {
    drag: CollectionDragController
    canMoveUp: boolean
    canMoveDown: boolean
    select: () => void
    move: (direction: CollectionMoveRequest['direction']) => void
  }
}

export function SampleListRow({
  sample,
  rowProps,
  playing,
  dragError,
  onPreview,
  onFavoriteChanged,
  onInspect,
  inspectorOpen,
  onAddToCollection,
  onRemoveFromCollection,
  membershipPending,
  order,
}: Props): React.JSX.Element {
  const menu = useContextMenu()
  return (
    <li
      {...rowProps}
      draggable={order ? false : rowProps.draggable}
      onDragOver={order ? (event) => order.drag.over(event, sample) : undefined}
      onDragLeave={
        order ? (event) => order.drag.leave(event, sample) : undefined
      }
      onDrop={order ? (event) => order.drag.drop(event, sample) : undefined}
      data-collection-order={order ? true : undefined}
      data-order-dragging={
        order?.drag.draggingId === sample.id ? true : undefined
      }
      data-order-drop={
        order?.drag.target?.sampleId === sample.id
          ? order.drag.target.placement
          : undefined
      }
      onContextMenu={menu.onContextMenu}
      onClick={(event) => {
        menu.onClick()
        rowProps.onClick?.(event)
      }}
      onKeyDown={(event) => {
        menu.onKeyDown(event)
        if (!event.defaultPrevented) {
          rowProps.onKeyDown?.(event)
        }
      }}
      title={`${sample.path}\n${order ? 'Drag the handle to reorder. Drag the name or waveform into your DAW.' : 'Drag this sample into your DAW'}`}
      data-audio-url={sample.audioUrl}
      data-sample-id={sample.id}
    >
      <div role="gridcell">
        <div className="sample-heading">
          {order && (
            <Button
              variant="ghost"
              className="sample-order-handle"
              aria-label={`Reorder ${sample.relativePath}`}
              title="Drag to reorder. Keyboard moves are in the Sample menu."
              disabled={!order.drag.enabled}
              draggable={order.drag.enabled}
              onClick={order.select}
              onDragStart={(event) => order.drag.start(event, sample)}
              onDragEnd={(event) => {
                event.stopPropagation()
                order.drag.end()
              }}
            >
              <span aria-hidden="true">⠿</span>
            </Button>
          )}
          <Button
            className="sample-name"
            data-testid="sample-name"
            disabled={!sample.audioUrl}
            draggable={sample.audioUrl !== null}
            aria-label={`Preview ${sample.relativePath}`}
            onClick={onPreview}
          >
            {sample.relativePath}
          </Button>
          {'rootPath' in sample &&
            sample.name !== sample.relativePath.split(/[\\/]/).pop() && (
              <span>{sample.name}</span>
            )}
          <FavoriteButton file={sample} onChanged={onFavoriteChanged} />
          {onInspect && (
            <Button
              variant="ghost"
              draggable={false}
              aria-label={`Info: ${sample.relativePath}`}
              aria-controls="sample-inspector"
              aria-expanded={
                inspectorOpen && rowProps['aria-selected'] === true
              }
              onDragStart={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
              onClick={(event) => onInspect(event.currentTarget)}
            >
              Info
            </Button>
          )}
          <Button
            draggable={false}
            disabled={!sample.audioUrl}
            className="preview-button"
            data-testid="preview-toggle"
            aria-label={`${playing ? 'Pause' : 'Play'} ${sample.relativePath}`}
            aria-pressed={playing}
            onDragStart={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            onClick={onPreview}
          >
            {playing ? 'Pause' : 'Preview'}
          </Button>
          <Button
            {...menu.triggerProps}
            aria-label={`More actions: ${sample.relativePath}`}
          >
            <span aria-hidden="true">⋯</span>
          </Button>
        </div>
        {'rootPath' in sample && <p>{sample.rootPath ?? sample.path}</p>}
        {sample.audioUrl && (
          <Waveform
            key={sample.audioUrl}
            audioUrl={sample.audioUrl}
            name={sample.relativePath}
          />
        )}
        {'unavailableReason' in sample && sample.unavailableReason && (
          <p role="status">{sample.unavailableReason}</p>
        )}
        {dragError && (
          <p role="alert" className="sample-error sample-drag-error">
            {dragError}
          </p>
        )}
      </div>
      <ContextMenu
        {...menu.menuProps}
        label={`Actions for ${sample.relativePath}`}
        items={[
          {
            id: 'preview',
            label: playing ? 'Pause preview' : 'Play preview',
            disabled: !sample.audioUrl,
            onSelect: onPreview,
          },
          ...(onInspect
            ? [{ id: 'info', label: 'Info', onSelect: onInspect }]
            : []),
          ...(order
            ? [
                {
                  id: 'move-up',
                  label: 'Move up',
                  disabled: !order.canMoveUp,
                  onSelect: () => order.move('up'),
                },
                {
                  id: 'move-down',
                  label: 'Move down',
                  disabled: !order.canMoveDown,
                  onSelect: () => order.move('down'),
                },
              ]
            : []),
          ...(onAddToCollection
            ? [
                {
                  id: 'add-to-collection',
                  label: 'Add to Collection',
                  disabled: membershipPending,
                  onSelect: onAddToCollection,
                },
              ]
            : []),
          ...(onRemoveFromCollection
            ? [
                {
                  id: 'remove-from-collection',
                  label: 'Remove from Collection',
                  disabled: membershipPending,
                  onSelect: onRemoveFromCollection,
                },
              ]
            : []),
        ]}
      />
    </li>
  )
}
