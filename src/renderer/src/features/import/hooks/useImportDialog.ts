import { useCallback, useEffect, useRef, useState } from 'react'
import type { PackImportReview } from '@shared/domain/pack'
import { unwrapIpcResult } from '@shared/ipc/result'
import { suggestPackName } from '../packName'
import { readPackName } from '../schemas'

// One folder's standalone outcome, so a folder that fails never hides the folders
// after it. The dialog owns this shape because it is what the dialog reports.
export interface FolderImportOutcome {
  directory: string
  sampleCount: number | null
  error: string | null
}

export type ImportMode = 'pack' | 'standalone'

export interface PackImportRow {
  directory: string
  // `registered` is a completed review of a folder whose source root already
  // belongs to a Pack, so it can never become a new one.
  state: 'preparing' | 'prepared' | 'failed' | 'registered'
  review: PackImportReview | null
  name: string
  error: string | null
  result:
    | { kind: 'created'; name: string }
    | { kind: 'failed'; message: string }
    | null
}

// A folder can become a new Pack only from its own complete review: prepared,
// not already held by a Pack, no unresolved conflict and a usable name.
export function reviewPackName(row: PackImportRow): string | null {
  if (row.state !== 'prepared' || !row.review) {
    return null
  }
  if (row.review.pack || row.review.conflictCount > 0) {
    return null
  }
  return readPackName(row.name).name
}

export interface ImportDialogOutcome {
  createdPacks: number
  importedFolders: number
}

type Phase = 'folders' | 'review' | 'results'
type Pending = 'selecting' | 'preparing' | 'confirming' | null

export interface ImportDialogController {
  phase: Phase
  directories: string[]
  mode: ImportMode
  rows: PackImportRow[]
  standalone: FolderImportOutcome[]
  pending: Pending
  error: string | null
  setMode: (mode: ImportMode) => void
  rename: (directory: string, name: string) => void
  chooseFolders: () => Promise<void>
  prepare: () => Promise<void>
  prepareFailed: () => Promise<void>
  importStandalone: () => Promise<void>
  confirm: () => Promise<void>
  close: () => void
}

function messageOf(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback
}

export function useImportDialog({
  importFolders,
  onClose,
}: {
  importFolders: (directories: string[]) => Promise<FolderImportOutcome[]>
  onClose: (outcome: ImportDialogOutcome) => void
}): ImportDialogController {
  const [phase, setPhase] = useState<Phase>('folders')
  const [directories, setDirectories] = useState<string[]>([])
  const [mode, setMode] = useState<ImportMode>('pack')
  const [rows, setRows] = useState<PackImportRow[]>([])
  const [standalone, setStandalone] = useState<FolderImportOutcome[]>([])
  // The dialog always opens by selecting folders, so that is its first state.
  const [pending, setPending] = useState<Pending>('selecting')
  const [error, setError] = useState<string | null>(null)
  const active = useRef(true)
  const busy = useRef(false)
  const selecting = useRef(false)
  // Dismissal is read through a ref so a new callback cannot restart selection.
  const finish = useRef(onClose)
  useEffect(() => {
    finish.current = onClose
  }, [onClose])

  const chooseFolders = useCallback(async () => {
    if (selecting.current) {
      return
    }
    selecting.current = true
    setPending('selecting')
    setError(null)
    try {
      const selected = unwrapIpcResult(await window.api.dialog.openFolders())
      if (!active.current) {
        return
      }
      // Cancelling the picker is not a failure, it closes the whole dialog.
      if (selected.length === 0) {
        finish.current({ createdPacks: 0, importedFolders: 0 })
        return
      }
      setDirectories(selected)
      setRows([])
      setPhase('folders')
    } catch (reason) {
      if (active.current) {
        setError(messageOf(reason, 'Unable to select folders.'))
      }
    } finally {
      selecting.current = false
      if (active.current) {
        setPending(null)
      }
    }
  }, [])

  useEffect(() => {
    active.current = true
    // The native picker is opened once the modal surface exists, and deferring
    // it keeps the first selection from cascading a render during the effect.
    queueMicrotask(() => void chooseFolders())
    return () => {
      active.current = false
    }
  }, [chooseFolders])

  // Each folder is prepared and reported on its own, so one rejection can never
  // hide the review of the folders after it.
  const prepareRows = useCallback(async (targets: string[]) => {
    if (busy.current || targets.length === 0) {
      return
    }
    busy.current = true
    setPending('preparing')
    setError(null)
    setPhase('review')
    setRows((current) => {
      const existing = new Map(current.map((row) => [row.directory, row]))
      const prepared = targets.map((directory): PackImportRow => {
        const previous = existing.get(directory)
        return {
          directory,
          state: 'preparing',
          review: null,
          name: previous?.name ?? suggestPackName(directory),
          error: null,
          result: null,
        }
      })
      return current.length === 0
        ? prepared
        : current.map(
            (row) =>
              prepared.find((entry) => entry.directory === row.directory) ??
              row,
          )
    })
    try {
      for (const directory of targets) {
        let patch: Pick<PackImportRow, 'state' | 'review' | 'error'>
        try {
          const review = unwrapIpcResult(
            await window.api.packs.prepareImport({ directory }),
          )
          patch = {
            state: review.pack ? 'registered' : 'prepared',
            review,
            error: null,
          }
        } catch (reason) {
          patch = {
            state: 'failed',
            review: null,
            error: messageOf(reason, 'Unable to prepare this folder.'),
          }
        }
        if (!active.current) {
          return
        }
        setRows((current) =>
          current.map((row) =>
            row.directory === directory ? { ...row, ...patch } : row,
          ),
        )
      }
    } finally {
      busy.current = false
      if (active.current) {
        setPending(null)
      }
    }
  }, [])

  const prepare = useCallback(
    () => prepareRows(directories),
    [directories, prepareRows],
  )

  const prepareFailed = useCallback(
    () =>
      prepareRows(
        rows
          .filter((row) => row.state === 'failed')
          .map((row) => row.directory),
      ),
    [prepareRows, rows],
  )

  const importStandalone = useCallback(async () => {
    if (busy.current || directories.length === 0) {
      return
    }
    busy.current = true
    setPending('preparing')
    setError(null)
    try {
      const outcomes = await importFolders(directories)
      if (!active.current) {
        return
      }
      setStandalone(outcomes)
      setPhase('results')
    } catch (reason) {
      if (active.current) {
        setError(messageOf(reason, 'Unable to import the folders.'))
      }
    } finally {
      busy.current = false
      if (active.current) {
        setPending(null)
      }
    }
  }, [directories, importFolders])

  const confirm = useCallback(async () => {
    if (busy.current) {
      return
    }
    // A folder is only committed from a complete review, so a folder that is
    // already held by a Pack never reaches the commit request.
    const requests = rows.flatMap((row) => {
      const name = reviewPackName(row)
      if (!name || !row.review) {
        return []
      }
      return [
        {
          directory: row.directory,
          request: {
            sourceRootId: row.review.sourceRootId,
            token: row.review.token,
            name,
            decisions: [],
          },
        },
      ]
    })
    if (requests.length === 0) {
      return
    }
    busy.current = true
    setPending('confirming')
    setError(null)
    try {
      for (const { directory, request } of requests) {
        let result: PackImportRow['result']
        try {
          const pack = unwrapIpcResult(
            await window.api.packs.importPack(request),
          )
          result = { kind: 'created', name: pack.name }
        } catch (reason) {
          result = {
            kind: 'failed',
            message: messageOf(reason, 'Unable to create this Pack.'),
          }
        }
        if (!active.current) {
          return
        }
        setRows((current) =>
          current.map((row) =>
            row.directory === directory ? { ...row, result } : row,
          ),
        )
      }
      if (active.current) {
        setPhase('results')
      }
    } finally {
      busy.current = false
      if (active.current) {
        setPending(null)
      }
    }
  }, [rows])

  // A reviewed name stays with its folder when another folder is retried.
  function rename(directory: string, name: string): void {
    setRows((current) =>
      current.map((row) =>
        row.directory === directory ? { ...row, name } : row,
      ),
    )
  }

  // Pending catalog writes cannot be cancelled, so dismissal waits for them.
  function close(): void {
    if (busy.current) {
      return
    }
    finish.current({
      createdPacks: rows.filter((row) => row.result?.kind === 'created').length,
      importedFolders: standalone.filter((outcome) => outcome.error === null)
        .length,
    })
  }

  return {
    phase,
    directories,
    mode,
    rows,
    standalone,
    pending,
    error,
    setMode,
    rename,
    chooseFolders,
    prepare,
    prepareFailed,
    importStandalone,
    confirm,
    close,
  }
}
