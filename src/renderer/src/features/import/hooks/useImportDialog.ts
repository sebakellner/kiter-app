import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  PackImportCandidate,
  PackImportRequest,
  PackImportReview,
} from '@shared/domain/pack'
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

export type ConflictResolution =
  PackImportRequest['decisions'][number]['resolution']

// Candidates are paged in the shared contract's default size. The dialog reads
// them one bounded page at a time, because a folder's conflicts are flags on
// that page rather than a list of their own.
export const IMPORT_CONFLICT_PAGE_SIZE = 50

// Only conflicting Samples are kept from a candidate page, so listing a folder's
// conflicts never holds its whole Sample list.
export interface PackImportConflicts {
  items: PackImportCandidate[]
  // Candidates read so far and the folder's candidate total, both echoed by the
  // last answered page.
  read: number
  total: number
  // `0` before the first page is read, `null` once every candidate was read.
  nextOffset: number | null
  loading: boolean
  error: string | null
}

export interface PackImportRow {
  directory: string
  // `registered` is a completed review of a folder whose source root already
  // belongs to a Pack, so it can never become a new one.
  state: 'preparing' | 'prepared' | 'failed' | 'registered'
  review: PackImportReview | null
  name: string
  // One explicit resolution per conflicting Sample, keyed by Sample id. It is
  // empty for a folder without conflicts.
  decisions: Record<string, ConflictResolution>
  conflicts: PackImportConflicts | null
  error: string | null
  result:
    | { kind: 'created'; name: string }
    | { kind: 'failed'; message: string }
    | null
}

export function decidedConflicts(row: PackImportRow): number {
  return Object.keys(row.decisions).length
}

// The worker refuses a commit without one decision per conflict, so the surface
// counts the same way it will be asked to commit.
export function undecidedConflicts(row: PackImportRow): number {
  return Math.max(0, (row.review?.conflictCount ?? 0) - decidedConflicts(row))
}

// The commit carries exactly the decisions the surface showed, never a default.
export function packDecisions(
  row: PackImportRow,
): PackImportRequest['decisions'] {
  return Object.entries(row.decisions).map(([sampleId, resolution]) => ({
    sampleId,
    resolution,
  }))
}

// A folder can become a new Pack only from its own complete review: prepared,
// not already held by a Pack, an explicit decision for every conflicting Sample
// and a usable name.
export function reviewPackName(row: PackImportRow): string | null {
  if (row.state !== 'prepared' || !row.review) {
    return null
  }
  if (row.review.pack || undecidedConflicts(row) > 0) {
    return null
  }
  return readPackName(row.name).name
}

export interface ImportDialogOutcome {
  createdPacks: number
  importedFolders: number
}

type Phase = 'folders' | 'review' | 'results'
// `conflicts` covers reading a folder's remaining candidate pages and deciding
// them in bulk; the row itself reports which of the two is running.
type Pending = 'selecting' | 'preparing' | 'confirming' | 'conflicts' | null

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
  decide: (
    directory: string,
    sampleId: string,
    resolution: ConflictResolution,
  ) => void
  decideAll: (
    directory: string,
    resolution: ConflictResolution,
  ) => Promise<void>
  readMoreConflicts: (directory: string) => Promise<void>
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

  // One bounded candidate page per request. Only the conflicting rows of the page
  // are kept, and the next offset always comes from the answered page, so reading
  // a folder's conflicts never guesses how much is left. The reply is merged with
  // the caller's snapshot because reads are serialized, which keeps the returned
  // value usable by a bulk decision in the same step.
  const readConflictPage = useCallback(
    async (
      directory: string,
      sourceRootId: string,
      known: PackImportConflicts,
    ): Promise<PackImportConflicts | null> => {
      setRows((current) =>
        current.map((row) =>
          row.directory === directory && row.conflicts
            ? {
                ...row,
                conflicts: { ...row.conflicts, loading: true, error: null },
              }
            : row,
        ),
      )
      try {
        const page = unwrapIpcResult(
          await window.api.packs.listImportCandidates({
            sourceRootId,
            limit: IMPORT_CONFLICT_PAGE_SIZE,
            offset: known.nextOffset ?? 0,
          }),
        )
        if (!active.current) {
          return null
        }
        const read = page.offset + page.items.length
        const next: PackImportConflicts = {
          items: [
            ...known.items,
            ...page.items.filter((item) => item.conflict),
          ],
          read,
          total: page.total,
          // An empty page ends the read instead of asking for the same offset
          // again forever.
          nextOffset: page.items.length > 0 && read < page.total ? read : null,
          loading: false,
          error: null,
        }
        setRows((current) =>
          current.map((row) =>
            row.directory === directory && row.conflicts
              ? { ...row, conflicts: next }
              : row,
          ),
        )
        return next
      } catch (reason) {
        if (active.current) {
          setRows((current) =>
            current.map((row) =>
              row.directory === directory && row.conflicts
                ? {
                    ...row,
                    conflicts: {
                      ...row.conflicts,
                      loading: false,
                      error: messageOf(
                        reason,
                        'Unable to read the conflicting Samples.',
                      ),
                    },
                  }
                : row,
            ),
          )
        }
        return null
      }
    },
    [],
  )

  // Each folder is prepared and reported on its own, so one rejection can never
  // hide the review of the folders after it.
  const prepareRows = useCallback(
    async (targets: string[]) => {
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
            // A new preparation means a new review, so decisions made against the
            // previous one are dropped rather than carried into another state.
            decisions: {},
            conflicts: null,
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
          let patch: Pick<
            PackImportRow,
            'state' | 'review' | 'error' | 'decisions' | 'conflicts'
          >
          try {
            const review = unwrapIpcResult(
              await window.api.packs.prepareImport({ directory }),
            )
            // A registration or a review without conflicts never reads candidates:
            // there is nothing to decide and no extra step to take.
            const conflicts =
              !review.pack && review.conflictCount > 0
                ? {
                    items: [],
                    read: 0,
                    total: review.sampleCount,
                    nextOffset: 0,
                    loading: true,
                    error: null,
                  }
                : null
            patch = {
              state: review.pack ? 'registered' : 'prepared',
              review,
              error: null,
              decisions: {},
              conflicts,
            }
          } catch (reason) {
            patch = {
              state: 'failed',
              review: null,
              error: messageOf(reason, 'Unable to prepare this folder.'),
              decisions: {},
              conflicts: null,
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
          // A conflicting folder names its Samples before it can be decided, so the
          // first candidate page is read as part of preparing it.
          if (patch.conflicts && patch.review) {
            await readConflictPage(
              directory,
              patch.review.sourceRootId,
              patch.conflicts,
            )
          }
        }
      } finally {
        busy.current = false
        if (active.current) {
          setPending(null)
        }
      }
    },
    [readConflictPage],
  )

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
    // already held by a Pack or still has an undecided conflict never reaches the
    // commit request.
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
            decisions: packDecisions(row),
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

  // A decision belongs to one conflicting Sample of one folder. Only a conflicting
  // Sample the row already listed can be decided, so the commit never carries a
  // decision for something the surface did not show.
  function decide(
    directory: string,
    sampleId: string,
    resolution: ConflictResolution,
  ): void {
    setRows((current) =>
      current.map((row) =>
        row.directory === directory &&
        row.conflicts?.items.some((item) => item.sampleId === sampleId)
          ? {
              ...row,
              decisions: { ...row.decisions, [sampleId]: resolution },
            }
          : row,
      ),
    )
  }

  // The commit needs one decision per conflict, so the bulk choice reads the
  // folder's remaining candidate pages and then decides exactly the conflicting
  // Samples the channel reported. It never fills in a set it did not read.
  const decideAll = useCallback(
    async (directory: string, resolution: ConflictResolution) => {
      if (busy.current) {
        return
      }
      const row = rows.find((entry) => entry.directory === directory)
      const review = row?.review
      if (!row?.conflicts || !review) {
        return
      }
      busy.current = true
      setPending('conflicts')
      setError(null)
      try {
        let conflicts = row.conflicts
        while (
          conflicts.items.length < review.conflictCount &&
          conflicts.nextOffset !== null
        ) {
          const next = await readConflictPage(
            directory,
            review.sourceRootId,
            conflicts,
          )
          if (!next) {
            return
          }
          conflicts = next
        }
        if (!active.current) {
          return
        }
        if (conflicts.items.length !== review.conflictCount) {
          setRows((current) =>
            current.map((entry) =>
              entry.directory === directory && entry.conflicts
                ? {
                    ...entry,
                    conflicts: {
                      ...entry.conflicts,
                      error:
                        'This folder does not report the conflicts it was ' +
                        'reviewed with. Prepare it again.',
                    },
                  }
                : entry,
            ),
          )
          return
        }
        const decided = Object.fromEntries(
          conflicts.items.map((item) => [item.sampleId, resolution]),
        )
        setRows((current) =>
          current.map((entry) =>
            entry.directory === directory
              ? { ...entry, decisions: { ...entry.decisions, ...decided } }
              : entry,
          ),
        )
      } finally {
        busy.current = false
        if (active.current) {
          setPending(null)
        }
      }
    },
    [readConflictPage, rows],
  )

  const readMoreConflicts = useCallback(
    async (directory: string) => {
      if (busy.current) {
        return
      }
      const row = rows.find((entry) => entry.directory === directory)
      const review = row?.review
      if (!row?.conflicts || !review || row.conflicts.nextOffset === null) {
        return
      }
      busy.current = true
      setPending('conflicts')
      setError(null)
      try {
        await readConflictPage(directory, review.sourceRootId, row.conflicts)
      } finally {
        busy.current = false
        if (active.current) {
          setPending(null)
        }
      }
    },
    [readConflictPage, rows],
  )

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
    decide,
    decideAll,
    readMoreConflicts,
    importStandalone,
    confirm,
    close,
  }
}
