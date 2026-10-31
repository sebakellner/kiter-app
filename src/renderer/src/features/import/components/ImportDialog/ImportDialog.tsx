import { useId } from 'react'
import { Button } from '@renderer/components/ui/Button'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Input } from '@renderer/components/ui/Input'
import type { FolderImportOutcome } from '@renderer/features/library/hooks/useLibrary'
import {
  ALREADY_REGISTERED_REASON,
  alreadyImportedStatus,
  ASSIGN_ALL_CONFLICTS,
  assignDecisionAction,
  conflictBlockedReason,
  conflictDecidedStatus,
  conflictOriginNote,
  conflictReadMoreAction,
  conflictSummary,
  KEEP_ALL_CONFLICTS,
  keepDecisionAction,
  PREPARE_CONSEQUENCE_NOTE,
} from '../../copy'
import {
  decidedConflicts,
  reviewPackName,
  undecidedConflicts,
  useImportDialog,
  type ConflictResolution,
  type ImportDialogController,
  type ImportDialogOutcome,
  type PackImportRow,
} from '../../hooks/useImportDialog'
import { readPackName } from '../../schemas'
import './import-dialog.css'

export function ImportDialog({
  importFolders,
  onClose,
}: {
  importFolders: (directories: string[]) => Promise<FolderImportOutcome[]>
  onClose: (outcome: ImportDialogOutcome) => void
}): React.JSX.Element {
  const titleId = useId()
  const state = useImportDialog({ importFolders, onClose })
  const title =
    state.phase === 'review'
      ? 'Review Packs'
      : state.phase === 'results'
        ? 'Import results'
        : 'Import folders'

  return (
    <Dialog
      open
      aria-labelledby={titleId}
      aria-busy={state.pending !== null}
      className="import-dialog"
      onDismiss={state.close}
    >
      <h2 id={titleId}>{title}</h2>
      {state.error && <p role="alert">{state.error}</p>}
      {state.phase === 'folders' && <FolderSelection state={state} />}
      {state.phase === 'review' && <PackReview state={state} />}
      {state.phase === 'results' && <ImportResults state={state} />}
    </Dialog>
  )
}

function FolderSelection({
  state,
}: {
  state: ImportDialogController
}): React.JSX.Element {
  const noteId = useId()
  const busy = state.pending !== null

  if (state.pending === 'selecting') {
    return (
      <>
        <p role="status">Selecting folders…</p>
        <DialogActions>
          <Button onClick={state.close}>Cancel</Button>
        </DialogActions>
      </>
    )
  }

  if (state.directories.length === 0) {
    return (
      <>
        <p>No folders selected.</p>
        <DialogActions>
          <Button onClick={state.close}>Cancel</Button>
          <Button variant="primary" onClick={() => void state.chooseFolders()}>
            Choose folders
          </Button>
        </DialogActions>
      </>
    )
  }

  const packs = state.mode === 'pack'
  return (
    <>
      <p>
        {state.directories.length}{' '}
        {state.directories.length === 1 ? 'folder' : 'folders'} selected.
      </p>
      <ul className="import-dialog-folders" aria-label="Selected folders">
        {state.directories.map((directory) => (
          <li key={directory}>{directory}</li>
        ))}
      </ul>
      <fieldset className="import-dialog-mode">
        <legend>Import as</legend>
        <label>
          <input
            type="radio"
            name="import-mode"
            checked={packs}
            disabled={busy}
            onChange={() => state.setMode('pack')}
          />
          One Pack per folder
        </label>
        <label>
          <input
            type="radio"
            name="import-mode"
            checked={!packs}
            disabled={busy}
            onChange={() => state.setMode('standalone')}
          />
          Standalone Samples
        </label>
      </fieldset>
      {packs && <p id={noteId}>{PREPARE_CONSEQUENCE_NOTE}</p>}
      <DialogActions>
        <Button disabled={busy} onClick={state.close}>
          Cancel
        </Button>
        <Button disabled={busy} onClick={() => void state.chooseFolders()}>
          Choose other folders
        </Button>
        <Button
          variant="primary"
          disabled={busy}
          aria-describedby={packs ? noteId : undefined}
          onClick={() => {
            void (packs ? state.prepare() : state.importStandalone())
          }}
        >
          {packs ? 'Prepare folders' : 'Import Samples'}
        </Button>
      </DialogActions>
    </>
  )
}

function PackReview({
  state,
}: {
  state: ImportDialogController
}): React.JSX.Element {
  const busy = state.pending !== null
  const failed = state.rows.filter((row) => row.state === 'failed')
  // Confirmation needs every selected folder to be creatable as a new Pack: none
  // failed, none already has a Pack, none conflicts and every name is usable.
  const blocked =
    busy ||
    state.rows.length === 0 ||
    state.rows.some((row) => reviewPackName(row) === null)

  return (
    <>
      {state.pending === 'preparing' && <p role="status">Preparing folders…</p>}
      {state.pending === 'confirming' && <p role="status">Creating Packs…</p>}
      <ul className="import-dialog-rows" aria-label="Prepared folders">
        {state.rows.map((row) => (
          <li key={row.directory}>
            <PackReviewRow
              row={row}
              disabled={busy}
              onRename={state.rename}
              onDecide={state.decide}
              onDecideAll={state.decideAll}
              onReadMore={state.readMoreConflicts}
            />
          </li>
        ))}
      </ul>
      <DialogActions>
        <Button disabled={busy} onClick={state.close}>
          Cancel
        </Button>
        {failed.length > 0 && (
          <Button disabled={busy} onClick={() => void state.prepareFailed()}>
            Prepare failed folders
          </Button>
        )}
        <Button
          variant="primary"
          disabled={blocked}
          onClick={() => void state.confirm()}
        >
          Create Packs
        </Button>
      </DialogActions>
    </>
  )
}

function PackReviewRow({
  row,
  disabled,
  onRename,
  onDecide,
  onDecideAll,
  onReadMore,
}: {
  row: PackImportRow
  disabled: boolean
  onRename: (directory: string, name: string) => void
  onDecide: (
    directory: string,
    sampleId: string,
    resolution: ConflictResolution,
  ) => void
  onDecideAll: (
    directory: string,
    resolution: ConflictResolution,
  ) => Promise<void>
  onReadMore: (directory: string) => Promise<void>
}): React.JSX.Element {
  const nameId = useId()
  const nameError = readPackName(row.name).error
  return (
    <section className="import-dialog-row" aria-label={row.directory}>
      <p className="import-dialog-row-path">{row.directory}</p>
      {row.state === 'preparing' && <p role="status">Preparing this folder…</p>}
      {row.state === 'failed' && (
        <p role="alert">This folder could not be prepared. {row.error}</p>
      )}
      {row.state === 'registered' && row.review?.pack && (
        <>
          <p>{alreadyImportedStatus(row.review.pack.name)}</p>
          <p className="import-dialog-row-counts">
            {row.review.sampleCount}{' '}
            {row.review.sampleCount === 1 ? 'Sample' : 'Samples'} ·{' '}
            {row.review.conflictCount === 0
              ? 'No conflicts'
              : `${row.review.conflictCount} ${
                  row.review.conflictCount === 1 ? 'conflict' : 'conflicts'
                }`}
          </p>
          <p role="alert">{ALREADY_REGISTERED_REASON}</p>
        </>
      )}
      {row.state === 'prepared' && row.review && (
        <>
          <label htmlFor={nameId}>Pack name</label>
          <Input
            id={nameId}
            value={row.name}
            disabled={disabled}
            aria-invalid={nameError !== null}
            aria-describedby={nameError ? `${nameId}-error` : undefined}
            onChange={(event) =>
              onRename(row.directory, event.currentTarget.value)
            }
          />
          {nameError && (
            <p id={`${nameId}-error`} role="alert">
              {nameError}
            </p>
          )}
          <p className="import-dialog-row-counts">
            {row.review.sampleCount}{' '}
            {row.review.sampleCount === 1 ? 'Sample' : 'Samples'} ·{' '}
            {row.review.conflictCount === 0
              ? 'No conflicts'
              : `${row.review.conflictCount} ${
                  row.review.conflictCount === 1 ? 'conflict' : 'conflicts'
                }`}
          </p>
          {row.review.conflictCount > 0 && row.conflicts && (
            <ConflictReview
              row={row}
              disabled={disabled}
              onDecide={onDecide}
              onDecideAll={onDecideAll}
              onReadMore={onReadMore}
            />
          )}
        </>
      )}
    </section>
  )
}

// A conflicting Sample can only be resolved by an explicit choice, so the row
// lists the conflicts the candidates channel reported and states how many of them
// are still undecided. The candidate reply carries a Sample's name, path and
// current origin, so the list shows exactly those.
function ConflictReview({
  row,
  disabled,
  onDecide,
  onDecideAll,
  onReadMore,
}: {
  row: PackImportRow
  disabled: boolean
  onDecide: (
    directory: string,
    sampleId: string,
    resolution: ConflictResolution,
  ) => void
  onDecideAll: (
    directory: string,
    resolution: ConflictResolution,
  ) => Promise<void>
  onReadMore: (directory: string) => Promise<void>
}): React.JSX.Element | null {
  const { review, conflicts } = row
  if (!review || !conflicts) {
    return null
  }
  const undecided = undecidedConflicts(row)
  const reading = conflicts.loading || disabled
  return (
    <section className="import-dialog-conflicts">
      <p>{conflictSummary(review.conflictCount)}</p>
      {undecided > 0 ? (
        <p role="alert">
          {conflictBlockedReason(undecided, review.conflictCount)}
        </p>
      ) : (
        <p role="status">
          {conflictDecidedStatus(decidedConflicts(row), review.conflictCount)}
        </p>
      )}
      <div className="import-dialog-conflict-actions">
        <Button
          disabled={reading}
          onClick={() => void onDecideAll(row.directory, 'keep')}
        >
          {KEEP_ALL_CONFLICTS}
        </Button>
        <Button
          disabled={reading}
          onClick={() => void onDecideAll(row.directory, 'assign')}
        >
          {ASSIGN_ALL_CONFLICTS}
        </Button>
      </div>
      <ul
        className="import-dialog-conflict-list"
        aria-label="Conflicting Samples"
      >
        {conflicts.items.map((item) => {
          const decision = row.decisions[item.sampleId]
          return (
            <li key={item.sampleId} className="import-dialog-conflict">
              <p className="import-dialog-conflict-name">{item.name}</p>
              <p className="import-dialog-row-path">{item.path}</p>
              <p>{conflictOriginNote(item)}</p>
              <div className="import-dialog-conflict-actions">
                <Button
                  aria-pressed={decision === 'keep'}
                  aria-label={keepDecisionAction(item.name)}
                  disabled={reading}
                  onClick={() => onDecide(row.directory, item.sampleId, 'keep')}
                >
                  Keep
                </Button>
                <Button
                  aria-pressed={decision === 'assign'}
                  aria-label={assignDecisionAction(item.name)}
                  disabled={reading}
                  onClick={() =>
                    onDecide(row.directory, item.sampleId, 'assign')
                  }
                >
                  Assign to this Pack
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
      {conflicts.loading && (
        <p role="status">Reading the conflicting Samples…</p>
      )}
      {conflicts.error && <p role="alert">{conflicts.error}</p>}
      {conflicts.nextOffset !== null && (
        <Button
          disabled={reading}
          onClick={() => void onReadMore(row.directory)}
        >
          {conflictReadMoreAction(conflicts.read, conflicts.total)}
        </Button>
      )}
    </section>
  )
}

function ImportResults({
  state,
}: {
  state: ImportDialogController
}): React.JSX.Element {
  if (state.mode === 'pack') {
    const created = state.rows.filter(
      (row) => row.result?.kind === 'created',
    ).length
    return (
      <>
        <p role="status">
          {created} of {state.rows.length} Packs created.
        </p>
        <ul className="import-dialog-rows" aria-label="Pack results">
          {state.rows.map((row) => (
            <li key={row.directory}>
              <section className="import-dialog-row" aria-label={row.directory}>
                {row.result?.kind === 'created' && (
                  <p>Created Pack “{row.result.name}”.</p>
                )}
                {row.result?.kind === 'failed' && (
                  <p role="alert">
                    Creating “{row.name}” failed. {row.result.message}
                  </p>
                )}
                {!row.result && <p>Not created.</p>}
              </section>
            </li>
          ))}
        </ul>
        <DialogActions>
          <Button onClick={state.close}>Close</Button>
        </DialogActions>
      </>
    )
  }

  const imported = state.standalone.filter(
    (outcome) => outcome.error === null,
  ).length
  return (
    <>
      <p role="status">
        {imported} of {state.standalone.length} folders imported.
      </p>
      <ul className="import-dialog-rows" aria-label="Folder results">
        {state.standalone.map((outcome) => (
          <li key={outcome.directory}>
            <section
              className="import-dialog-row"
              aria-label={outcome.directory}
            >
              {outcome.error === null ? (
                <p>
                  {outcome.sampleCount}{' '}
                  {outcome.sampleCount === 1 ? 'Sample' : 'Samples'} added.
                </p>
              ) : (
                <p role="alert">
                  Could not import this folder. {outcome.error}
                </p>
              )}
            </section>
          </li>
        ))}
      </ul>
      <DialogActions>
        <Button onClick={state.close}>Close</Button>
      </DialogActions>
    </>
  )
}

function DialogActions({
  children,
}: {
  children: React.ReactNode
}): React.JSX.Element {
  return <footer className="import-dialog-actions">{children}</footer>
}
