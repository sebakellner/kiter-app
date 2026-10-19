import { Button } from '@renderer/components/ui/Button'
import { Select } from '@renderer/components/ui/Select'
import { EditorPopover } from '../ClassificationEditor/EditorPopover'
import { useSampleTypeEditor } from './useSampleTypeEditor'

export function SampleTypeEditor({
  sampleId,
  anchor,
  onClose,
  onSaved,
}: {
  sampleId: string
  anchor: HTMLElement
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const editor = useSampleTypeEditor(sampleId, onSaved)
  return (
    <EditorPopover
      anchor={anchor}
      title="Edit Sample type"
      subject="Sample type"
      dirty={editor.dirty}
      pending={editor.pending}
      canSave={!editor.loading && !editor.needsReload && editor.saved !== null}
      onSave={editor.save}
      onClose={onClose}
    >
      {editor.loading && <p role="status">Loading saved Sample type…</p>}
      {editor.pending && <p role="status">Saving or refreshing Sample type…</p>}
      {editor.error && (
        <p role="alert">
          {editor.error}{' '}
          <Button
            disabled={editor.pending}
            onClick={() => void editor.reload()}
          >
            Reload saved type
          </Button>
        </p>
      )}
      {editor.saved && (
        <>
          <label>
            Sample type
            <Select
              {...editor.register('sampleType')}
              autoFocus
              disabled={editor.pending}
              aria-invalid={Boolean(editor.validationError)}
              aria-describedby={
                editor.validationError ? 'sample-type-error' : undefined
              }
            >
              <option value="unknown">Unknown</option>
              <option value="loop">Loop</option>
              <option value="one-shot">One-Shot</option>
            </Select>
          </label>
          {editor.validationError && (
            <p id="sample-type-error" role="alert">
              {editor.validationError}
            </p>
          )}
          <p>
            Unknown leaves the Sample unclassified. Changing type does not
            change audio.
          </p>
          <p>
            Currently saved type:{' '}
            {
              { unknown: 'Unknown', loop: 'Loop', 'one-shot': 'One-Shot' }[
                editor.saved.sampleType
              ]
            }
          </p>
          {editor.needsReload && (
            <p>Reload saved type to compare it with your preserved choice.</p>
          )}
        </>
      )}
    </EditorPopover>
  )
}
