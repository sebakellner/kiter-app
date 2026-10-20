import { useId, type ComponentProps } from 'react'
import { Button } from '@renderer/components/ui/Button'
import { Checkbox } from '@renderer/components/ui/Checkbox/Checkbox'
import { Badge } from '@renderer/components/ui/Badge/Badge'
import { TableCell, TableRow } from '@renderer/components/ui/Table'
import {
  ContextMenu,
  useContextMenu,
} from '@renderer/components/ui/ContextMenu'
import type { FavoriteState } from '@shared/ipc'
import { FavoriteButton } from '../FavoriteButton'
import { SampleWaveformCells } from './SampleWaveformCells'
import type { ListSample } from './useSampleList'
import type { CollectionDragController } from '@renderer/features/collections/hooks/useCollectionDrag'
import type { CollectionMoveRequest } from '@shared/domain/collection'
import type { SampleAudioDragProps } from '../../hooks/useSampleAudioDrag'

type Props = {
  sample: ListSample
  showRelativePath: boolean
  showSourceFolder: boolean
  rowProps: ComponentProps<'tr'>
  audioDragProps: SampleAudioDragProps
  playing: boolean
  dragError: string | null
  onPreview: () => void
  onFavoriteChanged: (state: FavoriteState) => void
  onInspect?: (opener: HTMLElement) => void
  onAddToCollection?: () => void
  onRemoveFromCollection?: () => void
  membershipPending: boolean
  batch?: { checked: boolean; onChange: (checked: boolean) => void }
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
  showRelativePath,
  showSourceFolder,
  rowProps,
  audioDragProps,
  playing,
  dragError,
  onPreview,
  onFavoriteChanged,
  onInspect,
  onAddToCollection,
  onRemoveFromCollection,
  membershipPending,
  batch,
  order,
}: Props): React.JSX.Element {
  const menu = useContextMenu()
  const sourceId = useId()
  const descriptionId =
    showRelativePath || showSourceFolder ? sourceId : undefined
  const classification =
    'classification' in sample ? sample.classification : undefined
  return (
    <TableRow
      {...rowProps}
      {...audioDragProps}
      draggable={order ? false : audioDragProps.draggable}
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
      aria-describedby={descriptionId}
    >
      {batch && (
        <TableCell role="gridcell" className="sample-row-control">
          <label
            className="sample-row-check"
            onClick={(event) => event.stopPropagation()}
            onDragStart={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
          >
            <Checkbox
              checked={batch.checked}
              aria-label={`Select ${sample.name}`}
              aria-describedby={descriptionId}
              onChange={(event) => batch.onChange(event.currentTarget.checked)}
            />
          </label>
        </TableCell>
      )}
      <TableCell role="gridcell" className="sample-row-pack">
        <div
          className="sample-row-pack-cover"
          role="img"
          aria-label="Pack cover placeholder"
        >
          <span aria-hidden="true">♪</span>
        </div>
      </TableCell>
      {order && (
        <TableCell role="gridcell" className="sample-row-control">
          <Button
            variant="ghost"
            className="sample-order-handle"
            aria-label={`Reorder ${sample.name}`}
            aria-describedby={descriptionId}
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
        </TableCell>
      )}
      <TableCell role="gridcell" className="sample-row-control">
        <Button
          variant="ghost"
          draggable={false}
          disabled={!sample.audioUrl}
          className="preview-button"
          data-testid="preview-toggle"
          aria-label={`${playing ? 'Pause' : 'Play'} ${sample.name}`}
          aria-describedby={descriptionId}
          aria-pressed={playing}
          onDragStart={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onClick={onPreview}
        >
          <span aria-hidden="true">{playing ? 'Ⅱ' : '▶'}</span>
        </Button>
      </TableCell>
      <TableCell role="gridcell">
        <div className="sample-row-identity">
          <Button
            {...audioDragProps}
            className="sample-name"
            data-testid="sample-name"
            disabled={!sample.audioUrl}
            aria-label={`Preview ${sample.name}`}
            aria-describedby={descriptionId}
            title={sample.name}
            onClick={onPreview}
          >
            {sample.name}
          </Button>
          {classification &&
          (classification.instruments.length > 0 ||
            classification.genres.length > 0 ||
            classification.sampleType ||
            classification.additionalInstrumentCount > 0 ||
            classification.additionalGenreCount > 0) ? (
            <div
              className="sample-row-badges"
              role="list"
              aria-label="Sample categories"
            >
              {classification.instruments.map((name) => (
                <Badge
                  key={`instrument:${name}`}
                  role="listitem"
                  title={`Instrument: ${name}`}
                >
                  <span className="sample-row-category-kind">Instrument: </span>
                  {name}
                </Badge>
              ))}
              {classification.genres.map((name) => (
                <Badge
                  key={`genre:${name}`}
                  role="listitem"
                  title={`Genre: ${name}`}
                >
                  <span className="sample-row-category-kind">Genre: </span>
                  {name}
                </Badge>
              ))}
              {classification.sampleType && (
                <Badge role="listitem">
                  <span className="sample-row-category-kind">
                    Sample type:{' '}
                  </span>
                  {classification.sampleType === 'loop' ? 'Loop' : 'One-Shot'}
                </Badge>
              )}
              {[
                {
                  count: classification.additionalInstrumentCount,
                  singular: 'instrument',
                  plural: 'instruments',
                },
                {
                  count: classification.additionalGenreCount,
                  singular: 'genre',
                  plural: 'genres',
                },
              ].map(
                ({ count, singular, plural }) =>
                  count > 0 && (
                    <span key={singular} role="listitem">
                      {onInspect ? (
                        <Button
                          variant="ghost"
                          aria-label={`View ${count} more ${count === 1 ? singular : plural}: ${sample.name}`}
                          aria-describedby={descriptionId}
                          onClick={(event) => onInspect(event.currentTarget)}
                        >
                          +{count} {count === 1 ? singular : plural}
                        </Button>
                      ) : (
                        <span>
                          {count} more {count === 1 ? singular : plural}
                        </span>
                      )}
                    </span>
                  ),
              )}
            </div>
          ) : null}
          {descriptionId && (
            <div id={sourceId} hidden>
              {showRelativePath && (
                <p data-testid="sample-relative-path">{sample.relativePath}</p>
              )}
              {showSourceFolder && (
                <p>
                  {'rootPath' in sample
                    ? (sample.rootPath ?? sample.path)
                    : sample.path}
                </p>
              )}
            </div>
          )}
          <div className="sample-row-feedback">
            {'unavailableReason' in sample && sample.unavailableReason && (
              <p role="status">{sample.unavailableReason}</p>
            )}
            {dragError && (
              <p role="alert" className="sample-error sample-drag-error">
                {dragError}
              </p>
            )}
          </div>
        </div>
      </TableCell>
      <SampleWaveformCells
        key={sample.audioUrl ?? 'unavailable'}
        sample={sample}
        audioDragProps={audioDragProps}
      />
      <TableCell
        role="gridcell"
        className="sample-row-control sample-row-favorite"
      >
        <FavoriteButton
          file={sample}
          compact
          onChanged={onFavoriteChanged}
          descriptionId={descriptionId}
        />
      </TableCell>
      <TableCell
        role="gridcell"
        className="sample-row-control sample-row-actions"
      >
        <Button
          variant="ghost"
          {...menu.triggerProps}
          aria-label={`More actions: ${sample.name}`}
          aria-describedby={descriptionId}
        >
          <span aria-hidden="true">⋯</span>
        </Button>
        <ContextMenu
          {...menu.menuProps}
          label={`Actions for ${sample.name}`}
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
      </TableCell>
    </TableRow>
  )
}
