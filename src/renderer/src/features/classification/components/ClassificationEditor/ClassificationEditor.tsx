import { Button } from '@renderer/components/ui/Button'
import { Input } from '@renderer/components/ui/Input'
import { Checkbox } from '@renderer/components/ui/Checkbox'
import { useClassificationEditor } from './useClassificationEditor'
import { EditorPopover } from './EditorPopover'

export function ClassificationEditor({
  sampleId,
  anchor,
  onClose,
  onSaved,
  dimension,
}: {
  sampleId: string
  anchor: HTMLElement
  onClose: () => void
  onSaved: () => void
  dimension: 'instrument' | 'genre'
}): React.JSX.Element {
  const editor = useClassificationEditor(sampleId, onSaved, dimension)
  const plural = dimension === 'instrument' ? 'instruments' : 'genres'
  const disabled = editor.loading || editor.pending

  return (
    <EditorPopover
      anchor={anchor}
      title={`Edit ${plural}`}
      subject={dimension}
      dirty={editor.dirty}
      pending={editor.pending}
      canSave={!disabled && !editor.needsReload && editor.saved !== null}
      onSave={editor.save}
      onClose={onClose}
    >
      {editor.loading && <p role="status">Loading saved {plural}…</p>}
      {editor.error && (
        <p role="alert">
          {editor.error}{' '}
          <Button
            disabled={editor.pending}
            onClick={() => void editor.reload()}
          >
            Reload saved {plural}
          </Button>
        </p>
      )}
      {editor.pending && <p role="status">Saving or refreshing {plural}…</p>}
      {editor.validationError && (
        <p id="instrument-selection-error" role="alert">
          {editor.validationError}
        </p>
      )}
      {editor.saved && (
        <>
          <p>Selected ({editor.selected.length})</p>
          <ul
            aria-label={`Selected ${plural}`}
            aria-describedby={
              editor.validationError ? 'instrument-selection-error' : undefined
            }
          >
            {editor.selected.map((instrument) => (
              <li key={instrument.id}>
                {instrument.name}{' '}
                <Button
                  disabled={disabled}
                  aria-label={`Remove ${instrument.name}`}
                  onClick={() => editor.toggle(instrument)}
                >
                  ×
                </Button>
              </li>
            ))}
          </ul>
          {editor.selected.length === 0 && <p>No {plural} selected.</p>}
          <label>
            Search {plural}
            <Input
              autoFocus
              type="search"
              maxLength={120}
              value={editor.search}
              disabled={disabled}
              onChange={(event) => editor.query(event.target.value)}
            />
          </label>
          {editor.searching && <p role="status">Loading {plural}…</p>}
          {editor.listError && (
            <p role="alert">
              {editor.listError}{' '}
              <Button disabled={disabled} onClick={editor.retryList}>
                Retry {plural}
              </Button>
            </p>
          )}
          {!editor.searching && !editor.listError && editor.page && (
            <>
              <ul aria-label={`Available ${plural}`}>
                {editor.page.items.map((instrument) => (
                  <li key={instrument.id}>
                    <label>
                      <Checkbox
                        checked={editor.selected.some(
                          ({ id }) => id === instrument.id,
                        )}
                        disabled={
                          disabled ||
                          (!editor.selected.some(
                            ({ id }) => id === instrument.id,
                          ) &&
                            editor.selected.length >= 1000)
                        }
                        onChange={() => editor.toggle(instrument)}
                      />
                      {instrument.name}
                    </label>
                  </li>
                ))}
              </ul>
              {editor.page.total === 0 && (
                <p>
                  {editor.search
                    ? `No matching ${plural}.`
                    : `No ${plural} in your library yet.`}
                </p>
              )}
              <div
                aria-label={`${dimension === 'instrument' ? 'Instrument' : 'Genre'} pages`}
              >
                <Button
                  disabled={disabled || editor.offset === 0}
                  onClick={() => editor.move(Math.max(0, editor.offset - 50))}
                >
                  Previous {plural}
                </Button>
                <Button
                  disabled={
                    disabled ||
                    editor.offset + editor.page.items.length >=
                      editor.page.total
                  }
                  onClick={() => editor.move(editor.offset + 50)}
                >
                  Next {plural}
                </Button>
              </div>
            </>
          )}
          {editor.needsReload && (
            <p>
              Reload saved {plural} to compare them with your preserved
              selection.
            </p>
          )}
          {!editor.needsReload && editor.saved && (
            <details>
              <summary>Currently saved {plural}</summary>
              <p>
                {editor.saved.instruments.map(({ name }) => name).join(', ') ||
                  'None'}
              </p>
            </details>
          )}
        </>
      )}
    </EditorPopover>
  )
}
